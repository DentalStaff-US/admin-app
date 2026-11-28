/**
 * Credential logic for the admin Documents list, moved out of the route so it
 * can be tested. Behaviour is unchanged: a row is judged against the discipline
 * it's linked to, on the LICENSE track.
 */
import { credentialBadge, credentialState, toISODate, type CertState } from '$lib/credentialStatusDisplay';
import type { DocumentType } from './taxonomy';

export type DocumentRow = {
	id: string;
	createdAt: Date | string;
	updatedAt: Date | string;
	uploadUrl: string;
	/** 'YYYY-MM-DD' (a true date column since migration 0060). */
	expiryDate: string | null;
	type: DocumentType;
	filename: string | null;
	candidateId: string;
	candidateFirstName: string | null;
	candidateLastName: string | null;
	disciplineId: string | null;
	disciplineName: string | null;
	disciplineAbbreviation: string | null;
	requiresLicense: boolean | null;
};

export type CredentialFilter = 'ALL' | 'EXPIRED' | 'EXPIRING';

/**
 * The credential pill for one row, or null. An expiry on an unlinked file, or on
 * a discipline that needs no credential, gates nothing and isn't shown as though
 * it does. A certification's date lives on the Experience & Rates row, so a
 * CERTIFICATE document's expiry is evidence, judged on the LICENSE track here.
 */
export function documentCredential(
	doc: Pick<DocumentRow, 'expiryDate' | 'disciplineId' | 'requiresLicense'>,
	today?: string
): { state: CertState; label: string } | null {
	if (!doc.expiryDate || !doc.disciplineId) return null;
	const input = { required: Boolean(doc.requiresLicense), expiresOn: toISODate(doc.expiryDate) };
	const badge = credentialBadge('LICENSE', input, today);
	if (!badge) return null;
	return { state: credentialState(input, today), label: badge.label };
}

function gatingState(doc: Pick<DocumentRow, 'expiryDate' | 'disciplineId' | 'requiresLicense'>, today?: string) {
	if (!doc.expiryDate || !doc.disciplineId || !doc.requiresLicense) return null;
	return credentialState({ required: true, expiresOn: toISODate(doc.expiryDate) }, today);
}

/** Lapsed and actually gating work: the "who is blocked" queue. */
export const isGatingExpired = (doc: Pick<DocumentRow, 'expiryDate' | 'disciplineId' | 'requiresLicense'>, today?: string) =>
	gatingState(doc, today) === 'EXPIRED';

/** About to lapse on a discipline that requires it. */
export const isExpiringSoon = (doc: Pick<DocumentRow, 'expiryDate' | 'disciplineId' | 'requiresLicense'>, today?: string) =>
	gatingState(doc, today) === 'EXPIRING';

/** Type filter, then credential filter (the admin's chasing queue). */
export function filterDocuments<T extends DocumentRow>(
	docs: readonly T[],
	type: DocumentType | 'ALL',
	credential: CredentialFilter,
	today?: string
): T[] {
	return docs
		.filter((d) => type === 'ALL' || d.type === type)
		.filter((d) =>
			credential === 'ALL' ? true : credential === 'EXPIRED' ? isGatingExpired(d, today) : isExpiringSoon(d, today)
		);
}

/** "Lastname, Firstname", as the list has always shown it. */
export function candidateName(doc: Pick<DocumentRow, 'candidateFirstName' | 'candidateLastName'>): string {
	return doc.candidateFirstName && doc.candidateLastName
		? `${doc.candidateLastName}, ${doc.candidateFirstName}`
		: 'Unknown';
}
