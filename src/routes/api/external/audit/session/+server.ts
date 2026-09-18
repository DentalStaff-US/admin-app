import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { authenticateUser } from '$lib/server/serverUtils';
import { recordAction } from '$lib/server/audit/audit';
import { logger } from '$lib/server/logger';

// The candidate app runs its own Better Auth instance, so its sign-ins and
// sign-outs never touch this app's session hooks. It reports them here instead.
// Deliberately allow-listed to session verbs: the entity is always the
// authenticated user, so a caller can only ever write rows about themself.
const bodySchema = z.object({
	action: z.enum(['SIGN_IN', 'SIGN_OUT']),
	metadata: z.record(z.unknown()).optional()
});

export const POST: RequestHandler = async ({ request }) => {
	const user = await authenticateUser(request);

	const parsed = bodySchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		return json({ success: false, message: 'Invalid body' }, { status: 400 });
	}

	try {
		await recordAction({
			entityType: 'USERS',
			entityId: user.id,
			action: parsed.data.action,
			actor: user,
			metadata: parsed.data.metadata ?? {}
		});
	} catch (err) {
		logger.error('external audit/session: ledger write failed', { error: err, userId: user.id });
		return json({ success: false }, { status: 500 });
	}

	return json({ success: true });
};
