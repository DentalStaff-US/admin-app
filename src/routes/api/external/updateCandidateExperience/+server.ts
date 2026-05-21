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
				disciplines: z.array(
					z.object({
						disciplineId: z.string(),
						experienceLevelId: z.string(),
						preferredHourlyMin: z.number().int().min(0),
						preferredHourlyMax: z.number().int().min(0)
					})
				)
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

		const disciplines = parsedExperience.data.disciplines;

		// Use a transaction to ensure atomicity
		await db.transaction(async (tx) => {
			// Delete all existing disciplines for this candidate
			await tx
				.delete(candidateDisciplineExperienceTable)
				.where(eq(candidateDisciplineExperienceTable.candidateId, existingProfile.id));

			// Insert new disciplines (if any)
			if (disciplines.length > 0) {
				await tx.insert(candidateDisciplineExperienceTable).values(
					disciplines.map((discipline) => ({
						candidateId: existingProfile.id,
						disciplineId: discipline.disciplineId,
						experienceLevelId: discipline.experienceLevelId,
						preferredHourlyMin: discipline.preferredHourlyMin,
						preferredHourlyMax: discipline.preferredHourlyMax,
						createdAt: new Date(),
						updatedAt: new Date()
					}))
				);
			}
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
