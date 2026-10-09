import { authenticateUser } from '$lib/server/serverUtils';
import { json, type RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import db from '$lib/server/database/drizzle';
import { candidateProfileTable } from '$lib/server/database/schemas/candidate';
import { eq } from 'drizzle-orm';
import { addMonths, format, parseISO } from 'date-fns';
import { logger } from '$lib/server/logger';
import { getCandidateAvailability } from '$lib/server/availability/queries';
import { hasCustomWeeklyPattern } from '$lib/server/availability/availability';
import { todayInET } from '$lib/server/certifications/credentialStatus';

const corsHeaders = {
	'Access-Control-Allow-Origin': env.CANDIDATE_APP_DOMAIN,
	'Access-Control-Allow-Methods': 'GET, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization',
	'Access-Control-Allow-Credentials': 'true'
};

export const OPTIONS: RequestHandler = async () => {
	return new Response(null, { headers: corsHeaders });
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The professional's weekly pattern plus their blackout and booked dates within a
 * window.
 *
 * `from`/`to` are whatever the client is rendering. There is deliberately NO upper
 * bound: a professional may block dates arbitrarily far ahead, so paging the
 * calendar years forward has to work.
 */
export const GET: RequestHandler = async ({ request, url }) => {
	let user;
	try {
		user = await authenticateUser(request);
		if (!user) {
			return json(
				{ success: false, message: 'Unauthorized' },
				{ status: 401, headers: corsHeaders }
			);
		}

		const [candidateProfile] = await db
			.select({ id: candidateProfileTable.id })
			.from(candidateProfileTable)
			.where(eq(candidateProfileTable.userId, user.id))
			.limit(1);

		if (!candidateProfile) {
			return json(
				{ success: false, message: 'Professional profile not found' },
				{ status: 404, headers: corsHeaders }
			);
		}

		const today = todayInET();
		const fromParam = url.searchParams.get('from');
		const toParam = url.searchParams.get('to');

		const from = fromParam && ISO_DATE.test(fromParam) ? fromParam : today;
		const to =
			toParam && ISO_DATE.test(toParam)
				? toParam
				: format(addMonths(parseISO(from), 6), 'yyyy-MM-dd');

		if (from > to) {
			return json(
				{ success: false, message: 'The start date must not be after the end date.' },
				{ status: 400, headers: corsHeaders }
			);
		}

		const availability = await getCandidateAvailability(candidateProfile.id, {
			from,
			to,
			includeBooked: true
		});

		return json(
			{
				success: true,
				availableDays: availability.availableDays,
				// TRUE when the column is NULL, i.e. they have never set this. The UI must
				// say "you haven't set this yet" rather than render seven ticked boxes
				// that look like a saved choice.
				availableDaysDefaulted: availability.availableDays === null,
				isCustomised:
					hasCustomWeeklyPattern(availability.availableDays) || availability.blackouts.length > 0,
				availableDaysUpdatedAt: availability.availableDaysUpdatedAt,
				availableDaysSource: availability.availableDaysSource,
				blackouts: availability.blackouts,
				// Returned here so the calendar can render booked days as locked without
				// a second request.
				bookedDates: availability.bookedDates,
				window: { from, to }
			},
			{ headers: corsHeaders }
		);
	} catch (err) {
		logger.error('getCandidateAvailability failed', { error: err, distinctId: user?.id });
		return json(
			{ success: false, message: 'Internal server error' },
			{ status: 500, headers: corsHeaders }
		);
	}
};
