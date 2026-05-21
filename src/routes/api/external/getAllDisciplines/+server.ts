import { error, json, type RequestHandler } from '@sveltejs/kit';
import { getAllDisciplines } from '$lib/server/database/queries/skills';
import { env } from '$env/dynamic/private';
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

export const GET: RequestHandler = async () => {
	try {
		const disciplines = await getAllDisciplines();
		return json({ success: true, disciplines });
	} catch (error) {
		logger.error('getAllDisciplines failed', { error });
		return json(
			{ success: false, message: 'Internal server error', error: error },
			{ status: 500, headers: corsHeaders }
		);
	}
};
