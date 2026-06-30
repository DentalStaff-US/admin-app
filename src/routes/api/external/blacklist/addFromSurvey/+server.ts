import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authenticateUser } from '$lib/server/serverUtils';
import { getCandidateProfileByUserId } from '$lib/server/database/queries/candidates';
import { addCandidateToBlacklist } from '$lib/server/database/queries/blacklist';
import { env } from '$env/dynamic/private';
import { z } from 'zod';
import { logger } from '$lib/server/logger';

/**
 * Candidate-initiated blacklist from the post-timesheet "experience survey".
 * When a candidate answers that they wouldn't keep working with a client, the
 * candidate app POSTs the client company id here. The candidate is resolved
 * from the JWT (never trusted from the body), and the symmetric blacklist row
 * is created — clearing the company's future jobs from the candidate's feeds
 * and cancelling any future shifts they hold for it.
 */

const bodySchema = z.object({
	companyId: z.string().min(1, 'Company ID is required')
});

const corsHeaders = {
	'Access-Control-Allow-Origin': env.CANDIDATE_APP_DOMAIN,
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization',
	'Access-Control-Allow-Credentials': 'true'
};

export const OPTIONS: RequestHandler = async () => {
	return new Response(null, { headers: corsHeaders });
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
		const parsed = bodySchema.safeParse(body);
		if (!parsed.success) {
			return json(
				{ success: false, message: parsed.error.errors[0].message },
				{ status: 400, headers: corsHeaders }
			);
		}

		const candidateProfile = await getCandidateProfileByUserId(user.id);
		if (!candidateProfile) {
			return json(
				{ success: false, message: 'Candidate profile not found' },
				{ status: 404, headers: corsHeaders }
			);
		}

		const { cancelledWorkdays } = await addCandidateToBlacklist(
			candidateProfile.id,
			parsed.data.companyId,
			{ actorUserId: user.id, actorRole: 'CANDIDATE', reason: 'experience survey' }
		);

		return json({ success: true, cancelledWorkdays }, { status: 200, headers: corsHeaders });
	} catch (err) {
		logger.error('blacklist.addFromSurvey failed', { error: err });
		return json(
			{ success: false, message: 'Internal server error' },
			{ status: 500, headers: corsHeaders }
		);
	}
};
