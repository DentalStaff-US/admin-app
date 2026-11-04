import { env } from '$env/dynamic/private';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { createTicket } from '../../../../../ws/ticket.js';

export const GET: RequestHandler = ({ locals }) => {
	if (!locals.user) throw error(401, 'Not signed in');
	return json(
		{ ticket: createTicket(locals.user.id, env.BETTER_AUTH_SECRET) },
		{ headers: { 'cache-control': 'no-store' } }
	);
};
