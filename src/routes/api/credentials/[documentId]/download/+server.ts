import { error, redirect, type RequestHandler } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import db from '$lib/server/database/drizzle';
import { candidateDocumentUploadsTable } from '$lib/server/database/schemas/candidate';
import {
	recurrenceDayTable,
	requisitionTable,
	workdayTable
} from '$lib/server/database/schemas/requisition';
import { USER_ROLES } from '$lib/config/constants';
import { checkIsAdmin } from '$lib/_helpers/checkIsAdmin';
import { getClientProfilebyUserId, getClientProfileByStaffUserId } from '$lib/server/database/queries/clients';
import { getClientCompanyByClientId } from '$lib/server/database/queries/clients';
import { assertCanAccessLocation } from '$lib/server/scoping';
import { getSignedDownloadUrl } from '$lib/server/uploads';
import { uploadUrlToKey } from '$lib/server/certifications/credentialLink';
import { LINKABLE_CREDENTIAL_TYPES } from '$lib/server/certifications/credentialStatus';
import { logger } from '$lib/server/logger';

/**
 * Short-lived download link for ONE credential document, for a practice or admin
 * verifying the professional assigned to one of their workdays.
 *
 * Why this exists rather than linking `uploadUrl` directly: `uploadFile` writes with
 * ACL 'public-read' and returns a permanent CDN URL, so putting it in client-facing
 * markup would publish a professional's licence to anyone who ever saw the page — and
 * keep it published long after the assignment ended. This re-checks authorisation on
 * every request and hands back a 15-minute signed URL instead.
 *
 * (That existing documents are already world-readable by URL is a separate,
 * pre-existing problem. This endpoint is careful not to widen it.)
 *
 * Authorisation, all of which must hold:
 *   - the document is a LICENSE/CERTIFICATE linked to a discipline;
 *   - `workdayId` names a workday the document's owner is actually assigned to;
 *   - that workday's requisition is for the SAME discipline the document evidences;
 *   - the caller is an admin, or the client/staff who owns that requisition.
 */
export const GET: RequestHandler = async ({ params, url, locals }) => {
	const user = locals.user;
	if (!user) throw error(401, 'Unauthorized');

	const documentId = params.documentId as string;
	const recurrenceDayId = url.searchParams.get('workdayId');
	if (!recurrenceDayId) throw error(400, 'Missing workday');

	const [doc] = await db
		.select({
			id: candidateDocumentUploadsTable.id,
			candidateId: candidateDocumentUploadsTable.candidateId,
			disciplineId: candidateDocumentUploadsTable.disciplineId,
			type: candidateDocumentUploadsTable.type,
			uploadUrl: candidateDocumentUploadsTable.uploadUrl,
			filename: candidateDocumentUploadsTable.filename
		})
		.from(candidateDocumentUploadsTable)
		.where(eq(candidateDocumentUploadsTable.id, documentId))
		.limit(1);

	// Same 404 for "no such document" and "not a credential", so this cannot be used
	// to probe which document ids exist.
	if (
		!doc ||
		!doc.disciplineId ||
		!(LINKABLE_CREDENTIAL_TYPES as readonly string[]).includes(doc.type)
	) {
		throw error(404, 'Not found');
	}

	// The document's owner must actually be assigned to this workday, and the workday
	// must be for the discipline this credential evidences.
	const [assignment] = await db
		.select({
			companyId: requisitionTable.companyId,
			locationId: requisitionTable.locationId,
			disciplineId: requisitionTable.disciplineId
		})
		.from(workdayTable)
		.innerJoin(requisitionTable, eq(requisitionTable.id, workdayTable.requisitionId))
		.where(
			and(
				eq(workdayTable.recurrenceDayId, recurrenceDayId),
				eq(workdayTable.candidateId, doc.candidateId)
			)
		)
		.limit(1);

	if (!assignment || assignment.disciplineId !== doc.disciplineId) {
		throw error(404, 'Not found');
	}

	// Admins always; otherwise the requesting client must own this requisition.
	if (!checkIsAdmin(user.role)) {
		if (user.role === USER_ROLES.CLIENT) {
			const client = await getClientProfilebyUserId(user.id);
			const company = await getClientCompanyByClientId(client?.id);
			if (!company || company.id !== assignment.companyId) throw error(403, 'Forbidden');
		} else if (user.role === USER_ROLES.CLIENT_STAFF) {
			const client = await getClientProfileByStaffUserId(user.id);
			const company = await getClientCompanyByClientId(client?.id);
			if (!company || company.id !== assignment.companyId) throw error(403, 'Forbidden');
			// Staff are additionally scoped to the locations they're assigned to.
			await assertCanAccessLocation(user, assignment.locationId);
		} else {
			throw error(403, 'Forbidden');
		}
	}

	const key = uploadUrlToKey(doc.uploadUrl);
	if (!key) throw error(404, 'Not found');

	try {
		const signed = await getSignedDownloadUrl(key, 900, doc.filename ?? undefined);
		throw redirect(302, signed);
	} catch (err) {
		// A redirect is thrown, not returned — let it through.
		if (err && typeof err === 'object' && 'status' in err) throw err;
		logger.error('credential download failed', { error: err, documentId });
		throw error(500, 'Could not open that document');
	}
};
