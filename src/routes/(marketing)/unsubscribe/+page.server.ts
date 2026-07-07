import { fail } from '@sveltejs/kit';
import type { PageServerLoad, RequestEvent } from './$types';
import { eq } from 'drizzle-orm';
import db from '$lib/server/database/drizzle';
import { userTable } from '$lib/server/database/schemas/auth';
import { verifyUnsubscribe } from '$lib/server/campaigns/unsubscribe';

export const load: PageServerLoad = async (event) => {
	const userId = event.url.searchParams.get('u') ?? '';
	const token = event.url.searchParams.get('t') ?? '';
	// Confirm the token here but don't mutate — the actual opt-out happens on the
	// POST below, so email-client link prefetching can't unsubscribe someone.
	return { valid: verifyUnsubscribe(userId, token), userId, token };
};

export const actions = {
	default: async (event: RequestEvent) => {
		const data = await event.request.formData();
		const userId = String(data.get('u') ?? '');
		const token = String(data.get('t') ?? '');
		if (!verifyUnsubscribe(userId, token)) return fail(400, { done: false });

		await db.update(userTable).set({ receiveEmail: false }).where(eq(userTable.id, userId));
		return { done: true };
	}
};
