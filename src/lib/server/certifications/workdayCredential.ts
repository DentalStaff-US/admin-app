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

import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import db from '$lib/server/database/drizzle';
import {
	candidateDisciplineExperienceTable,
	candidateDocumentUploadsTable,
	candidateLicenseGraceTable,
	candidateProfileTable
} from '$lib/server/database/schemas/candidate';
import { disciplineTable } from '$lib/server/database/schemas/skill';
import { userTable } from '$lib/server/database/schemas/auth';
import { recurrenceDayTable, requisitionTable, workdayTable } from '$lib/server/database/schemas/requisition';
import {
	LICENSE_DOC_TYPES,
	credentialState,
	graceDaysRemaining,
	todayInET,
	type CertState
} from './credentialStatus';
import { credentialExpiryToISODate } from './credentialLink';

export type WorkdayCredential = {
	candidateId: string;
	candidateName: string;
	disciplineId: string;
	disciplineName: string;
	abbreviation: string;
	/** Platform-required, document-backed, and genuinely inspectable. */
	license: {
		state: CertState;
		expiresOn: string | null;
		/** Days before a missing license starts hiding jobs; null when no clock runs. */
		graceDaysRemaining: number | null;
		document: { id: string; filename: string | null; uploadedAt: Date } | null;
	};
	/** The professional's own declaration. NOT verified by DTSS — label it as such. */
	certification: {
		state: CertState;
		expiresOn: string | null;
		selfDeclared: true;
	};
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
			requiresLicense: disciplineTable.requiresLicense,
			requiresCert: candidateDisciplineExperienceTable.requiresCert,
			certExpiresOn: candidateDisciplineExperienceTable.certExpiresOn
		})
		.from(workdayTable)
		.innerJoin(requisitionTable, eq(requisitionTable.id, workdayTable.requisitionId))
		.innerJoin(disciplineTable, eq(disciplineTable.id, requisitionTable.disciplineId))
		.innerJoin(candidateProfileTable, eq(candidateProfileTable.id, workdayTable.candidateId))
		.innerJoin(userTable, eq(userTable.id, candidateProfileTable.userId))
		// LEFT, not INNER: the professional may have been assigned to a workday for a
		// discipline no longer on their profile. The panel should still render the
		// license half rather than vanishing.
		.leftJoin(
			candidateDisciplineExperienceTable,
			and(
				eq(candidateDisciplineExperienceTable.candidateId, workdayTable.candidateId),
				eq(candidateDisciplineExperienceTable.disciplineId, requisitionTable.disciplineId)
			)
		)
		.where(eq(workdayTable.recurrenceDayId, recurrenceDayId))
		.limit(1);

	if (!assigned || !assigned.disciplineId) return null;
	// Nothing to show when neither track applies to this discipline.
	if (!assigned.requiresLicense && !assigned.requiresCert) return null;

	// The LICENSE in force for that discipline, matching the gate's MAX(expiry_date):
	// the furthest-future document wins, even if an older one was uploaded more
	// recently.
	//
	// Two filters here are load-bearing and were both missing. Without the type
	// filter a CERTIFICATE could be presented to a practice as the license. Without
	// `expiry_date IS NOT NULL` the ordering lies: Postgres `DESC` is NULLS FIRST, so
	// a single linked document with no expiry outranked a perfectly valid license and
	// this panel reported MISSING for a professional who was fully current.
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
				eq(candidateDocumentUploadsTable.disciplineId, assigned.disciplineId),
				inArray(candidateDocumentUploadsTable.type, [...LICENSE_DOC_TYPES]),
				isNotNull(candidateDocumentUploadsTable.expiryDate)
			)
		)
		.orderBy(desc(candidateDocumentUploadsTable.expiryDate))
		.limit(1);

	// The grace clock, so a practice sees "no license yet, 12 days to supply one"
	// rather than a bare warning with no sense of the deadline.
	const [grace] = await db
		.select({ notifiedAt: candidateLicenseGraceTable.notifiedAt })
		.from(candidateLicenseGraceTable)
		.where(
			and(
				eq(candidateLicenseGraceTable.candidateId, assigned.candidateId),
				eq(candidateLicenseGraceTable.disciplineId, assigned.disciplineId)
			)
		)
		.limit(1);

	const expiresOn = doc ? credentialExpiryToISODate(doc.expiryDate) : null;
	const license = {
		required: true,
		expiresOn,
		graceStartedOn: grace ? credentialExpiryToISODate(grace.notifiedAt) : null
	};
	const today = todayInET();

	// The professional's own declared certification, shown alongside but clearly
	// SELF-DECLARED: presenting a date someone typed about themselves to a practice
	// as though DTSS had verified it is a liability this panel must not create.
	const certification = {
		required: Boolean(assigned.requiresCert),
		expiresOn: assigned.certExpiresOn ?? null
	};

	return {
		candidateId: assigned.candidateId,
		candidateName: `${assigned.firstName ?? ''} ${assigned.lastName ?? ''}`.trim(),
		disciplineId: assigned.disciplineId,
		disciplineName: assigned.disciplineName,
		abbreviation: assigned.abbreviation,
		license: {
			state: credentialState(license, today),
			expiresOn,
			graceDaysRemaining: graceDaysRemaining(license, today),
			document: doc ? { id: doc.id, filename: doc.filename, uploadedAt: doc.uploadedAt } : null
		},
		certification: {
			state: credentialState(certification, today),
			expiresOn: certification.expiresOn,
			/** Always true. The practice must be told this is not DTSS-verified. */
			selfDeclared: true
		}
	};
}
