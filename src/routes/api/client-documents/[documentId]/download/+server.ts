import { error, redirect, type RequestHandler } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import db from '$lib/server/database/drizzle';
import { clientDocumentUploadsTable } from '$lib/server/database/schemas/client';
import { USER_ROLES } from '$lib/config/constants';
import { checkIsAdmin } from '$lib/_helpers/checkIsAdmin';
import {
	getClientProfilebyUserId,
	getClientProfileByStaffUserId,
	getClientStaffProfilebyUserId
} from '$lib/server/database/queries/clients';
import { getSignedDownloadUrl } from '$lib/server/uploads';
import { uploadUrlToKey } from '$lib/server/certifications/credentialLink';
import { recordAction } from '$lib/server/audit/audit';
import { logger } from '$lib/server/logger';

/**
 * Short-lived download link for one client document.
 *
 * Signed agreements are stored PRIVATE (no public-read ACL), so their `upload_url`
 * is a handle, not an openable link. This route re-checks access on every request
 * and redirects to a 15-minute signed URL. It works for the older public uploads
 * too, so the documents tables link here for every row.
 *
 * Access: admins; the client owner; client staff who can manage documents
 * (CLIENT_ADMIN / CLIENT_MANAGER — the same roles the settings upload action allows).
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	const user = locals.user;
	if (!user) throw error(401, 'Unauthorized');

	const [doc] = await db
		.select({
			id: clientDocumentUploadsTable.id,
			clientId: clientDocumentUploadsTable.clientId,
			uploadUrl: clientDocumentUploadsTable.uploadUrl,
			filename: clientDocumentUploadsTable.filename,
			type: clientDocumentUploadsTable.type
		})
		.from(clientDocumentUploadsTable)
		.where(eq(clientDocumentUploadsTable.id, params.documentId as string))
		.limit(1);
	if (!doc) throw error(404, 'Not found');

	if (!checkIsAdmin(user.role)) {
		let clientId: string | undefined;
		if (user.role === USER_ROLES.CLIENT) {
			clientId = (await getClientProfilebyUserId(user.id))?.id;
		} else if (user.role === USER_ROLES.CLIENT_STAFF) {
			const staff = await getClientStaffProfilebyUserId(user.id);
			if (staff?.staffRole === 'CLIENT_ADMIN' || staff?.staffRole === 'CLIENT_MANAGER') {
				clientId = (await getClientProfileByStaffUserId(user.id))?.id;
			}
		}
		// Same 404 as a missing document, so ids can't be probed.
		if (!clientId || clientId !== doc.clientId) throw error(404, 'Not found');
	}

	const key = uploadUrlToKey(doc.uploadUrl);
	if (!key) throw error(404, 'Not found');

	try {
		const signed = await getSignedDownloadUrl(key, 900, doc.filename ?? undefined);
		recordAction({
			entityType: 'USERS',
			entityId: user.id,
			action: 'DOWNLOAD',
			metadata: { clientDocumentId: doc.id, clientId: doc.clientId, type: doc.type }
		}).catch((err) => logger.error('client document download: ledger write failed', { error: err }));
		throw redirect(302, signed);
	} catch (err) {
		// A redirect is thrown, not returned — let it through.
		if (err && typeof err === 'object' && 'status' in err) throw err;
		logger.error('client document download failed', { error: err, documentId: doc.id });
		throw error(500, 'Could not open that document');
	}
};
