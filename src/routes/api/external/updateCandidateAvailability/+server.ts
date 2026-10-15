import { authenticateUser } from '$lib/server/serverUtils';
import { json, type RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import db from '$lib/server/database/drizzle';
import { candidateProfileTable } from '$lib/server/database/schemas/candidate';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { eachDayOfInterval, format, parseISO } from 'date-fns';
import { logger } from '$lib/server/logger';
import { saveCandidateAvailability } from '$lib/server/availability/queries';
import { MAX_BLACKOUT_DATES_PER_REQUEST } from '$lib/server/availability/availability';

const corsHeaders = {
	'Access-Control-Allow-Origin': env.CANDIDATE_APP_DOMAIN,
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization',
	'Access-Control-Allow-Credentials': 'true'
};

export const OPTIONS: RequestHandler = async () => {
	return new Response(null, { headers: corsHeaders });
};

const isoDate = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must be YYYY-MM-DD')
	// The regex alone accepts 2026-02-30, which would surface as a Postgres error
	// rather than a 400. Round-tripping through date-fns rejects it here.
	.refine((d) => {
		const parsed = parseISO(d);
		return !Number.isNaN(parsed.getTime()) && format(parsed, 'yyyy-MM-dd') === d;
	}, 'Not a real date');

const bodySchema = z
	.object({
		/**
		 * Absent ⇒ leave the weekly pattern alone, so the calendar can save blackouts
		 * on their own. `null` ⇒ reset to the default, available all seven days.
		 * `[]` ⇒ 400, same reasoning as the available_days CHECK constraint: an empty
		 * array would hide every shift from this professional with no visible cause.
		 */
		availableDays: z
			.array(z.number().int().min(0).max(6))
			.min(1, 'Pick at least one day you can work.')
			.max(7)
			.nullable()
			.optional(),
		blackouts: z
			.object({
				// The window this request is authoritative for. Without it, a client that
				// only rendered three months would delete month four on save, including
				// rows an admin entered.
				from: isoDate,
				to: isoDate,
				dates: z.array(isoDate).max(MAX_BLACKOUT_DATES_PER_REQUEST).default([]),
				// Expanded server-side, so a phone can block a vacation without posting
				// fifteen strings. There is no range entity in the database.
				ranges: z.array(z.object({ start: isoDate, end: isoDate })).max(50).default([]),
				notes: z.record(isoDate, z.string().max(200)).optional()
			})
			.optional()
	})
	// .strict() for the same reason updateCandidateExperience uses it: a future client
	// that starts sending a field should get a 400 rather than a silent drop, because
	// a silent drop reads to the user as "I set it and it didn't save".
	.strict()
	.refine(
		(b) => b.availableDays !== undefined || b.blackouts !== undefined,
		'Nothing to update: send availableDays, blackouts, or both.'
	);

export const POST: RequestHandler = async ({ request }) => {
	let user;
	try {
		const contentType = request.headers.get('content-type');
		if (!contentType?.includes('application/json')) {
			return json(
				{ success: false, message: 'Content-Type must be application/json' },
				{ status: 400, headers: corsHeaders }
			);
		}

		user = await authenticateUser(request);
		if (!user) {
			return json(
				{ success: false, message: 'Unauthorized' },
				{ status: 401, headers: corsHeaders }
			);
		}

		const body = await request.json().catch(() => null);
		if (!body || typeof body !== 'object') {
			return json(
				{ success: false, message: 'Invalid request body' },
				{ status: 400, headers: corsHeaders }
			);
		}

		const parsed = bodySchema.safeParse(body);
		if (!parsed.success) {
			return json(
				{
					success: false,
					message: parsed.error.errors[0]?.message ?? 'Invalid availability payload',
					errors: parsed.error.flatten()
				},
				{ status: 400, headers: corsHeaders }
			);
		}

		const [candidateProfile] = await db
			.select({ id: candidateProfileTable.id, status: candidateProfileTable.status })
			.from(candidateProfileTable)
			.where(eq(candidateProfileTable.userId, user.id))
			.limit(1);

		if (!candidateProfile) {
			return json(
				{ success: false, message: 'Professional profile not found' },
				{ status: 404, headers: corsHeaders }
			);
		}

		// PENDING is allowed: setting availability is part of completing a profile, and
		// the onboarding step runs before approval.
		//
		// DO NOT add isCandidateFrozen() here. The sibling endpoint this file is
		// modelled on (updateCandidateExperience) calls it to lock disciplines and
		// rates once `approved` is true. Applying that rule to availability would
		// permanently freeze it at the moment of approval — destroying the feature for
		// exactly the professionals who use it most.
		if (candidateProfile.status === 'INACTIVE' || candidateProfile.status === 'DENIED') {
			return json(
				{ success: false, message: 'This account cannot update availability.' },
				{ status: 403, headers: corsHeaders }
			);
		}

		let blackouts: { from: string; to: string; dates: string[]; notes?: Record<string, string> } | undefined;
		if (parsed.data.blackouts) {
			const { from, to, dates, ranges, notes } = parsed.data.blackouts;
			if (from > to) {
				return json(
					{
						success: false,
						message: 'The start date must not be after the end date.',
						reason: 'window'
					},
					{ status: 400, headers: corsHeaders }
				);
			}

			const expanded = new Set(dates);
			for (const range of ranges) {
				if (range.start > range.end) {
					return json(
						{
							success: false,
							message: 'A range must start on or before it ends.',
							reason: 'window'
						},
						{ status: 400, headers: corsHeaders }
					);
				}
				for (const day of eachDayOfInterval({
					start: parseISO(range.start),
					end: parseISO(range.end)
				})) {
					expanded.add(format(day, 'yyyy-MM-dd'));
				}
				if (expanded.size > MAX_BLACKOUT_DATES_PER_REQUEST) {
					return json(
						{
							success: false,
							message: `Save at most ${MAX_BLACKOUT_DATES_PER_REQUEST} days at a time.`,
							reason: 'too_many'
						},
						{ status: 400, headers: corsHeaders }
					);
				}
			}

			blackouts = { from, to, dates: [...expanded].sort(), notes };
		}

		const result = await saveCandidateAvailability({
			candidateId: candidateProfile.id,
			availableDays: parsed.data.availableDays,
			blackouts,
			// The professional's own door. An admin acting through the admin app writes
			// 'ADMIN'; a superadmin impersonating a professional through the candidate
			// app lands here and correctly writes 'CANDIDATE', while action_history
			// records who really did it.
			source: 'CANDIDATE',
			actor: user
		});

		if (!result.ok) {
			const status = result.reason === 'BOOKED' ? 409 : result.reason === 'ERROR' ? 500 : 400;
			return json(
				{ success: false, message: result.message, reason: result.reason.toLowerCase() },
				{ status, headers: corsHeaders }
			);
		}

		return json(
			{
				success: true,
				availableDays: result.availableDays,
				blackouts: result.blackouts,
				conflictsWithBooked: result.conflictsWithBooked
			},
			{ headers: corsHeaders }
		);
	} catch (err) {
		logger.error('updateCandidateAvailability failed', { error: err, distinctId: user?.id });
		return json(
			{ success: false, message: 'Internal server error' },
			{ status: 500, headers: corsHeaders }
		);
	}
};
