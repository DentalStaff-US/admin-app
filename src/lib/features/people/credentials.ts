/**
 * Credential badges for the professional screens, as StatusBadge tones. The
 * states and wording come from $lib/credentialStatusDisplay (the client view
 * of the server rules); only its palette classes are replaced by tones.
 */
import type { StatusTone } from '$tokens/status';
import {
	credentialBadge,
	credentialState,
	toISODate,
	type CredentialInput,
	type CredentialTrack
} from '$lib/credentialStatusDisplay';
import { credentialTone } from './people';

export type CredentialChip = { label: string; tone: StatusTone; track: CredentialTrack };

function chip(track: CredentialTrack, input: CredentialInput, today?: string): CredentialChip | null {
	const badge = credentialBadge(track, input, today);
	if (!badge) return null;
	return { label: badge.label, tone: credentialTone(credentialState(input, today)), track };
}

type DisciplineEntry = {
	discipline?: { requiresLicense?: boolean | null } | null;
	experience?: { requiresCert?: boolean | null } | null;
	effectiveLicenseExpiry?: string | Date | null;
	licenseGraceStartedOn?: string | Date | null;
	effectiveCertExpiry?: string | Date | null;
};

/**
 * Up to two chips for one Experience & Rates entry, one per track. The
 * certification expiry is the newest linked CERTIFICATE document's (what the
 * gate reads), deliberately not the legacy `experience.certExpiresOn`.
 */
export function disciplineCredentials(d: DisciplineEntry, today?: string): CredentialChip[] {
	return [
		chip(
			'LICENSE',
			{
				required: Boolean(d?.discipline?.requiresLicense),
				expiresOn: toISODate(d?.effectiveLicenseExpiry ?? null),
				graceStartedOn: toISODate(d?.licenseGraceStartedOn ?? null)
			},
			today
		),
		chip(
			'CERTIFICATION',
			{ required: Boolean(d?.experience?.requiresCert), expiresOn: toISODate(d?.effectiveCertExpiry ?? null) },
			today
		)
	].filter((c): c is CredentialChip => c !== null);
}

/**
 * A document's chip, judged against the LICENSE track of the discipline it is
 * linked to: an expiry on an unlinked file, or on a discipline needing no
 * license, gates nothing and must not look alarming.
 */
export function documentCredential(
	doc: { expiryDate?: string | Date | null; disciplineId?: string | null },
	disciplines: { discipline: { id: string; requiresLicense?: boolean | null } }[],
	today?: string
): CredentialChip | null {
	if (!doc?.expiryDate) return null;
	const linked = disciplines.find((d) => d.discipline.id === doc.disciplineId);
	return chip(
		'LICENSE',
		{ required: Boolean(linked?.discipline?.requiresLicense), expiresOn: toISODate(doc.expiryDate) },
		today
	);
}

/** Problems only (warning/negative), for the page header; the full list lives on Overview. */
export function credentialProblems(chips: CredentialChip[]): CredentialChip[] {
	return chips.filter((c) => c.tone === 'warning' || c.tone === 'negative');
}
