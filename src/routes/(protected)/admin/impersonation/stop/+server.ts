import { json, type RequestHandler } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { recordAction } from '$lib/server/audit/audit';
import { logger } from '$lib/server/logger';

// Server-side exit from impersonation. The layout used to call
// authClient.admin.stopImpersonating() straight from the browser, which left
// no server hook to write the IMPERSONATE_STOP ledger row against. This
// endpoint records first (while locals.session still carries impersonatedBy),
// then restores the admin's own session exactly as the client call did.
export const POST: RequestHandler = async (event) => {
	const session = event.locals.session;
	const impersonated = event.locals.user;
	if (!session?.impersonatedBy || !impersonated) {
		return json({ success: false, message: 'Not impersonating' }, { status: 400 });
	}

	try {
		await recordAction({
			entityType: 'USERS',
			entityId: impersonated.id,
			action: 'IMPERSONATE_STOP',
			actor: session.impersonatedBy,
			metadata: { impersonatedUserId: impersonated.id, sessionId: session.id }
		});
	} catch (err) {
		logger.error('impersonation stop: ledger write failed', { error: err });
	}

	await auth.api.stopImpersonating({ headers: event.request.headers });
	return json({ success: true });
};
