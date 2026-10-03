/**
 * "Trust but verify": the credential a practice and DTSS staff can see for the
 * professional assigned to a workday.
 *
 * This exists because the gate cannot help here. Hiding future listings does nothing
 * about a shift already on the calendar, so the people hosting that shift need to be
 * able to check the credential themselves.
 *
 * Scope is deliberately narrow: the ASSIGNED professional, the requisition's OWN
 * discipline, one workday. Never their whole credential wallet, never anyone else.
 */

import { and, desc, eq } from 'drizzle-orm';
import db from '$lib/server/database/drizzle';
import {
	candidateDocumentUploadsTable,
	candidateProfileTable
} from '$lib/server/database/schemas/candidate';
import { disciplineTable } from '$lib/server/database/schemas/skill';
import { userTable } from '$lib/server/database/schemas/auth';
import { recurrenceDayTable, requisitionTable, workdayTable } from '$lib/server/database/schemas/requisition';
import { CERT_CREDENTIAL_TYPES, certState, todayInET, type CertState } from './certStatus';
import { credentialExpiryToISODate } from './credentialLink';

export type WorkdayCredential = {
	candidateId: string;
	candidateName: string;
	disciplineId: string;
	disciplineName: string;
	abbreviation: string;
	requiresCertification: boolean;
	state: CertState;
	expiresOn: string | null;
	/** The newest credential document backing it, if any. */
	document: { id: string; filename: string | null; uploadedAt: Date } | null;
};

/**
 * The credential for whoever is assigned to `recurrenceDayId`, for that requisition's
 * discipline. Null when nobody is assigned, or the discipline needs no credential —
 * in which case the panel renders nothing rather than a reassuring-looking blank.
 */
export async function getWorkdayCredential(
	recurrenceDayId: string
): Promise<WorkdayCredential | null> {
	const [assigned] = await db
		.select({
			candidateId: workdayTable.candidateId,
			firstName: userTable.firstName,
			lastName: userTable.lastName,
			disciplineId: requisitionTable.disciplineId,
			disciplineName: disciplineTable.name,
			abbreviation: disciplineTable.abbreviation,
			requiresCertification: disciplineTable.requiresCertification
		})
		.from(workdayTable)
		.innerJoin(requisitionTable, eq(requisitionTable.id, workdayTable.requisitionId))
		.innerJoin(disciplineTable, eq(disciplineTable.id, requisitionTable.disciplineId))
		.innerJoin(candidateProfileTable, eq(candidateProfileTable.id, workdayTable.candidateId))
		.innerJoin(userTable, eq(userTable.id, candidateProfileTable.userId))
		.where(eq(workdayTable.recurrenceDayId, recurrenceDayId))
		.limit(1);

	if (!assigned || !assigned.disciplineId) return null;
	if (!assigned.requiresCertification) return null;

	// Newest credential for that discipline. Ordered by expiry, matching the gate's
	// MAX(expiry_date): the furthest-future certificate is the one in force, even if
	// an older one was uploaded more recently.
	const [doc] = await db
		.select({
			id: candidateDocumentUploadsTable.id,
			filename: candidateDocumentUploadsTable.filename,
			expiryDate: candidateDocumentUploadsTable.expiryDate,
			uploadedAt: candidateDocumentUploadsTable.createdAt
		})
		.from(candidateDocumentUploadsTable)
		.where(
			and(
				eq(candidateDocumentUploadsTable.candidateId, assigned.candidateId),
				eq(candidateDocumentUploadsTable.disciplineId, assigned.disciplineId)
			)
		)
		.orderBy(desc(candidateDocumentUploadsTable.expiryDate))
		.limit(1);

	const isCredential = doc != null;
	const expiresOn = isCredential ? credentialExpiryToISODate(doc.expiryDate) : null;

	return {
		candidateId: assigned.candidateId,
		candidateName: `${assigned.firstName ?? ''} ${assigned.lastName ?? ''}`.trim(),
		disciplineId: assigned.disciplineId,
		disciplineName: assigned.disciplineName,
		abbreviation: assigned.abbreviation,
		requiresCertification: true,
		state: certState(
			{ requiresCertification: true, effectiveExpiry: expiresOn },
			todayInET()
		),
		expiresOn,
		document: doc ? { id: doc.id, filename: doc.filename, uploadedAt: doc.uploadedAt } : null
	};
}

/** Document types that may be surfaced here. Mirrors the gate. */
export const VIEWABLE_CREDENTIAL_TYPES = CERT_CREDENTIAL_TYPES;
