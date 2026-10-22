import { authenticateUser } from '$lib/server/serverUtils';
import { json, type RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import db from '$lib/server/database/drizzle';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import {
	candidateDisciplineExperienceTable,
	candidateProfileTable
} from '$lib/server/database/schemas/candidate';
import { getSkillCatalog } from '$lib/server/database/queries/skills';
import {
	canEditCandidateSkills,
	getCandidateSkills,
	replaceCandidateSkills,
	SkillWriteError
} from '$lib/server/skills/candidateSkills';
import { logger } from '$lib/server/logger';

const corsHeaders = {
	'Access-Control-Allow-Origin': env.CANDIDATE_APP_DOMAIN,
	'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization',
	'Access-Control-Allow-Credentials': 'true'
};

export const OPTIONS: RequestHandler = async () => new Response(null, { headers: corsHeaders });

async function loadProfile(userId: string) {
	const [profile] = await db
		.select({
			id: candidateProfileTable.id,
			status: candidateProfileTable.status,
			approved: candidateProfileTable.approved
		})
		.from(candidateProfileTable)
		.where(eq(candidateProfileTable.userId, userId))
		.limit(1);
	return profile ?? null;
}

/**
 * The professional's skills, the catalog scoped to their disciplines, and whether
 * they may still edit (false once approved — see canEditCandidateSkills).
 */
export const GET: RequestHandler = async ({ request }) => {
	try {
		const user = await authenticateUser(request);
		if (!user) {
			return json(
				{ success: false, message: 'Unauthorized' },
				{ status: 401, headers: corsHeaders }
			);
		}

		const profile = await loadProfile(user.id);
		if (!profile) {
			return json(
				{ success: false, message: 'Candidate profile not found' },
				{ status: 404, headers: corsHeaders }
			);
		}

		const disciplineIds = (
			await db
				.select({ disciplineId: candidateDisciplineExperienceTable.disciplineId })
				.from(candidateDisciplineExperienceTable)
				.where(eq(candidateDisciplineExperienceTable.candidateId, profile.id))
		).map((r) => r.disciplineId);

		const skills = await getCandidateSkills(profile.id);
		const catalog = await getSkillCatalog({
			disciplineIds,
			keepSkillIds: skills.map((s) => s.skillId)
		});
		const decision = canEditCandidateSkills(profile, user.role);

		return json(
			{
				success: true,
				skills,
				catalog,
				editable: decision.allowed,
				lockedReason: decision.allowed ? null : decision.reason
			},
			{ status: 200, headers: corsHeaders }
		);
	} catch (error) {
		logger.error('candidateSkills GET failed', { error });
		return json(
			{ success: false, message: 'An unexpected error occurred' },
			{ status: 500, headers: corsHeaders }
		);
	}
};

const payloadSchema = z.object({ skillIds: z.array(z.string().min(1)).max(200) }).strict();

/** Replace the professional's skill set. 403 `reason: 'APPROVED'` once approved. */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const user = await authenticateUser(request);
		if (!user) {
			return json(
				{ success: false, message: 'Unauthorized' },
				{ status: 401, headers: corsHeaders }
			);
		}

		const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			return json(
				{ success: false, message: 'Invalid request', errors: parsed.error.flatten() },
				{ status: 400, headers: corsHeaders }
			);
		}

		const profile = await loadProfile(user.id);
		if (!profile) {
			return json(
				{ success: false, message: 'Candidate profile not found' },
				{ status: 404, headers: corsHeaders }
			);
		}

		const decision = canEditCandidateSkills(profile, user.role);
		if (!decision.allowed) {
			return json(
				{ success: false, reason: decision.reason, message: decision.message },
				{ status: 403, headers: corsHeaders }
			);
		}

		try {
			await replaceCandidateSkills(profile.id, parsed.data.skillIds, { actor: user });
		} catch (e) {
			if (e instanceof SkillWriteError) {
				return json(
					{ success: false, reason: e.reason, message: e.message },
					{ status: 400, headers: corsHeaders }
				);
			}
			throw e;
		}

		return json(
			{ success: true, message: 'Skills updated', skills: await getCandidateSkills(profile.id) },
			{ status: 200, headers: corsHeaders }
		);
	} catch (error) {
		logger.error('candidateSkills POST failed', { error });
		return json(
			{ success: false, message: 'An unexpected error occurred' },
			{ status: 500, headers: corsHeaders }
		);
	}
};
