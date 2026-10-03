/**
 * Presentational credential status for the ADMIN app's Svelte components.
 *
 * Mirrors the server rules in `$lib/server/certifications/certStatus.ts`, which stays
 * the authority — that module is server-only (it is imported by the gate), so this is
 * the client-safe view of the same states. Keep the two in step.
 */

import { differenceInCalendarDays, parseISO } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';

export const CERT_TIMEZONE = 'America/New_York';
export const CERT_EXPIRING_SOON_DAYS = 60;

export type CertState = 'NOT_REQUIRED' | 'MISSING' | 'VALID' | 'EXPIRING' | 'EXPIRED';

export function todayInET(now: Date = new Date()): string {
	return formatInTimeZone(now, CERT_TIMEZONE, 'yyyy-MM-dd');
}

/** 'YYYY-MM-DD' from whatever shape the API returned (date string or Date). */
export function toISODate(v: string | Date | null | undefined): string | null {
	if (!v) return null;
	if (typeof v === 'string') return v.slice(0, 10);
	return v.toISOString().slice(0, 10);
}

export function daysUntilExpiry(expiresOn: string, today: string = todayInET()): number {
	return differenceInCalendarDays(parseISO(expiresOn), parseISO(today));
}

export function certState(
	input: { requiresCertification: boolean; effectiveExpiry: string | null },
	today: string = todayInET()
): CertState {
	if (!input.requiresCertification) return 'NOT_REQUIRED';
	if (!input.effectiveExpiry) return 'MISSING';
	if (input.effectiveExpiry < today) return 'EXPIRED';
	return daysUntilExpiry(input.effectiveExpiry, today) <= CERT_EXPIRING_SOON_DAYS
		? 'EXPIRING'
		: 'VALID';
}

/** 'Apr 30, 2027' from 'YYYY-MM-DD', read as a calendar date (no timezone shift). */
export function formatCertDate(value: string | Date | null | undefined): string {
	const iso = toISODate(value);
	if (!iso) return '—';
	return formatInTimeZone(parseISO(`${iso}T00:00:00Z`), 'UTC', 'MMM d, yyyy');
}

/**
 * Badge for one Experience & Rates entry. Null means render nothing — a discipline
 * that needs no credential should produce no visual noise.
 *
 * Admin wording differs from the professional's: staff need to know the consequence
 * ("jobs hidden") and what to chase, not what to do themselves.
 */
export function certBadge(
	state: CertState,
	expiresOn: string | null,
	today: string = todayInET()
): { label: string; class: string } | null {
	switch (state) {
		case 'NOT_REQUIRED':
			return null;
		case 'MISSING':
			// Not blocked — chased. Saying "jobs hidden" here would be wrong and would
			// send staff looking for a problem that does not exist.
			return {
				label: 'No certificate on file',
				class: 'bg-red-50 text-red-700 ring-1 ring-red-200'
			};
		case 'EXPIRED':
			return {
				label: `Expired ${formatCertDate(expiresOn)} — jobs hidden`,
				class: 'bg-red-50 text-red-700 ring-1 ring-red-200'
			};
		case 'EXPIRING': {
			const days = expiresOn ? daysUntilExpiry(expiresOn, today) : 0;
			return {
				label: days <= 0 ? 'Expires today' : `Expires in ${days} day${days === 1 ? '' : 's'}`,
				class: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
			};
		}
		case 'VALID':
			return {
				label: `Valid through ${formatCertDate(expiresOn)}`,
				class: 'bg-gray-50 text-gray-700 ring-1 ring-gray-200'
			};
	}
}
