/**
 * Presentational credential status for the ADMIN app's Svelte components.
 *
 * Mirrors the server rules in `$lib/server/certifications/credentialStatus.ts`, which
 * stays the authority — that module is server-only, so this is the client-safe view
 * of the same states. Keep the two in step.
 *
 * Two tracks, and the wording must never conflate them: a LICENSE is platform-required
 * and document-backed; a CERTIFICATION is declared by the professional for their
 * jurisdiction.
 */

import { differenceInCalendarDays, parseISO } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';

export const CERT_TIMEZONE = 'America/New_York';
export const CERT_EXPIRING_SOON_DAYS = 60;
export const LICENSE_GRACE_DAYS = 30;

export type CredentialTrack = 'LICENSE' | 'CERTIFICATION';
export type CertState =
	| 'NOT_REQUIRED'
	| 'MISSING'
	| 'MISSING_GRACE'
	| 'VALID'
	| 'EXPIRING'
	| 'EXPIRED';

export type CredentialInput = {
	required: boolean;
	expiresOn: string | null;
	/** LICENSE only: when the missing-license clock started. */
	graceStartedOn?: string | null;
};

export function todayInET(now: Date = new Date()): string {
	return formatInTimeZone(now, CERT_TIMEZONE, 'yyyy-MM-dd');
}

/** 'YYYY-MM-DD' from whatever shape the API returned. */
export function toISODate(v: string | Date | null | undefined): string | null {
	if (!v) return null;
	if (typeof v === 'string') return v.slice(0, 10);
	return v.toISOString().slice(0, 10);
}

export function daysUntil(date: string, today: string = todayInET()): number {
	return differenceInCalendarDays(parseISO(date), parseISO(today));
}

export function credentialState(c: CredentialInput, today: string = todayInET()): CertState {
	if (!c.required) return 'NOT_REQUIRED';
	if (!c.expiresOn) {
		if (!c.graceStartedOn) return 'MISSING';
		return daysUntil(c.graceStartedOn, today) + LICENSE_GRACE_DAYS > 0 ? 'MISSING_GRACE' : 'EXPIRED';
	}
	if (c.expiresOn < today) return 'EXPIRED';
	return daysUntil(c.expiresOn, today) <= CERT_EXPIRING_SOON_DAYS ? 'EXPIRING' : 'VALID';
}

export function graceDaysRemaining(c: CredentialInput, today: string = todayInET()): number | null {
	if (!c.required || c.expiresOn || !c.graceStartedOn) return null;
	return Math.max(0, daysUntil(c.graceStartedOn, today) + LICENSE_GRACE_DAYS);
}

/** 'Apr 30, 2027' from 'YYYY-MM-DD', read as a calendar date (no timezone shift). */
export function formatCertDate(value: string | Date | null | undefined): string {
	const iso = toISODate(value);
	if (!iso) return '—';
	return formatInTimeZone(parseISO(`${iso}T00:00:00Z`), 'UTC', 'MMM d, yyyy');
}

const NOUN: Record<CredentialTrack, string> = {
	LICENSE: 'License',
	CERTIFICATION: 'Certification'
};

/**
 * Badge for one track. Null means render nothing — a track that does not apply
 * should produce no visual noise.
 *
 * Admin wording differs from the professional's: staff need the consequence
 * ("jobs hidden") and what to chase, not instructions for themselves.
 */
export function credentialBadge(
	track: CredentialTrack,
	c: CredentialInput,
	today: string = todayInET()
): { label: string; class: string } | null {
	const state = credentialState(c, today);
	const noun = NOUN[track];

	switch (state) {
		case 'NOT_REQUIRED':
			return null;
		case 'MISSING':
			return {
				label: `No ${noun.toLowerCase()} on file`,
				class: 'bg-red-50 text-red-700 ring-1 ring-red-200'
			};
		case 'MISSING_GRACE': {
			const left = graceDaysRemaining(c, today) ?? 0;
			return {
				label: `No ${noun.toLowerCase()} on file — ${left} day${left === 1 ? '' : 's'} to supply one`,
				class: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
			};
		}
		case 'EXPIRED':
			return {
				label: c.expiresOn
					? `${noun} expired ${formatCertDate(c.expiresOn)} — jobs hidden`
					: `${noun} not supplied — jobs hidden`,
				class: 'bg-red-50 text-red-700 ring-1 ring-red-200'
			};
		case 'EXPIRING': {
			const days = c.expiresOn ? daysUntil(c.expiresOn, today) : 0;
			return {
				label:
					days <= 0
						? `${noun} expires today`
						: `${noun} expires in ${days} day${days === 1 ? '' : 's'}`,
				class: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
			};
		}
		case 'VALID':
			return {
				label: `${noun} valid through ${formatCertDate(c.expiresOn)}`,
				class: 'bg-gray-50 text-gray-700 ring-1 ring-gray-200'
			};
	}
}
