import { authenticateUser } from '$lib/server/serverUtils';
import { json, type RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import db from '$lib/server/database/drizzle';
import {
	candidateDisciplineExperienceTable,
	candidateProfileTable
} from '$lib/server/database/schemas/candidate';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { logger } from '$lib/server/logger';
import {
	getCandidateDisciplineSnapshot,
	replaceCandidateDisciplines
} from '$lib/server/database/queries/candidateDisciplines';
import { isCandidateFrozen } from '$lib/server/documents/candidateDocumentGuards';
import { recordAction } from '$lib/server/audit/audit';
import { uniqueDisciplineIds } from '$lib/config/zod-schemas';

const corsHeaders = {
	'Access-Control-Allow-Origin': env.CANDIDATE_APP_DOMAIN,
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization',
	'Access-Control-Allow-Credentials': 'true'
};

export const OPTIONS: RequestHandler = async () => {
	return new Response(null, {
		headers: corsHeaders
	});
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const user = await authenticateUser(request);
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

		const parsedExperience = z
			.object({
				disciplines: z
					.array(
						z
							.object({
								disciplineId: z.string(),
								experienceLevelId: z.string(),
								preferredHourlyMin: z.number().int().min(0),
								preferredHourlyMax: z.number().int().min(0)
							})
							// .strict() so a future client that starts sending certification
							// fields gets a 400 rather than having them silently dropped.
							// A silent drop reads as "I set it and it didn't save", which is
							// indistinguishable from "it saved then got cleared".
							.strict()
							// The sibling schemas have this; this one did not.
							.refine((d) => d.preferredHourlyMax >= d.preferredHourlyMin, {
								message: 'Maximum rate must be greater than or equal to minimum rate',
								path: ['preferredHourlyMax']
							})
					)
					// Without this an empty array reaches replaceCandidateDisciplines,
					// where notInArray(x, []) renders as `true` and deletes every row.
					.min(1, 'Please select at least one discipline')
					.superRefine(uniqueDisciplineIds)
			})
			.safeParse(body);

		if (!parsedExperience.success) {
			return json(
				{
					success: false,
					message: 'Invalid experience payload',
					errors: parsedExperience.error.flatten()
				},
				{ status: 400, headers: corsHeaders }
			);
		}

		const [existingProfile] = await db
			.select()
			.from(candidateProfileTable)
			.where(eq(candidateProfileTable.userId, user.id));

		if (!existingProfile) {
			return json(
				{ success: false, message: 'Profile not found' },
				{ status: 404, headers: corsHeaders }
			);
		}

		// Until now the ONLY thing stopping an approved professional rewriting their
		// disciplines, levels and rates was a UI fork in the candidate app
		// (settings/experience/+page.svelte). This endpoint is reachable directly with
		// a valid JWT, so the rule was advisory. It matters more now that a
		// certification lives on these rows.
		//
		// Renewing a credential after approval goes through
		// updateCandidateDisciplineCertification instead, which can write two columns
		// on one row and nothing else.
		if (isCandidateFrozen(existingProfile)) {
			return json(
				{
					success: false,
					reason: 'APPROVED',
					message:
						'Your profile has been approved, so your disciplines, experience levels and rates are locked. You can still keep your credentials current, or contact support if something else needs to change.'
				},
				{ status: 403, headers: corsHeaders }
			);
		}

		const disciplines = parsedExperience.data.disciplines;

		await db.transaction(async (tx) => {
			const before = await getCandidateDisciplineSnapshot(existingProfile.id, tx);
			await replaceCandidateDisciplines(existingProfile.id, disciplines, tx);
			await recordAction({
				entityType: 'CANDIDATES',
				entityId: existingProfile.id,
				action: 'UPDATE',
				actor: user,
				before: { disciplines: before },
				after: { disciplines },
				metadata: { field: 'disciplines' },
				tx
			});
		});

		return json(
			{
				success: true,
				message: 'Experience updated successfully'
			},
			{ status: 200, headers: corsHeaders }
		);
	} catch (error) {
		logger.error('updateCandidateExperience failed', { error });
		return json(
			{ success: false, message: 'An unexpected error occurred' },
			{ status: 500, headers: corsHeaders }
		);
	}
};
