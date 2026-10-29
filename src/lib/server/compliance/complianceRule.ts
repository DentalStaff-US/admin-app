/**
 * Who is out of compliance, how badly, and what can be done about it.
 *
 * Professionals only today: the credential states come from
 * `certifications/credentialStatus.ts` (the authority — nothing here re-derives
 * expiry or grace). The item shape is subject-generic so client-agreement rules can
 * produce `subjectType: 'CLIENT'` items into the same widget and page later.
 *
 * Kept free of DB imports so it can be tested directly; `queries.ts` feeds it.
 */

import { addDays, format, parseISO } from 'date-fns';
import {
	credentialState,
	daysUntil,
	graceDaysRemaining,
	LICENSE_GRACE_DAYS,
	type CertState,
	type CredentialInput,
	type CredentialTrack
} from '$lib/server/certifications/credentialStatus';

import type { ComplianceSeverity } from '$lib/config/compliance';

export {
	COMPLIANCE_SEVERITIES,
	SEVERITY_LABELS,
	type ComplianceSeverity
} from '$lib/config/compliance';

export type ComplianceSubjectType = 'PROFESSIONAL' | 'CLIENT';

export type ComplianceShift = { requisitionId: number; recurrenceDayId: string; date: string };

export type ComplianceItem = {
	subjectType: ComplianceSubjectType;
	subjectId: string;
	subjectName: string;
	/** Stable per item; snoozes and reminder throttling key on it. */
	ruleKey: string;
	severity: ComplianceSeverity;
	title: string;
	detail: string;
	/** When it lapsed / lapses / the grace ends, 'YYYY-MM-DD'. */
	dueOn: string | null;
	upcomingShifts: ComplianceShift[];
	snoozedUntil: string | null;
	/** Whether "Send reminder" has a message to send for this item. */
	remindable: boolean;
	/** ISO timestamp of a reminder sent in the throttle window, else null. Set by queries.ts. */
	remindedAt?: string | null;
	/** Present on professional credential items. */
	credential?: {
		track: CredentialTrack;
		state: CertState;
		disciplineId: string;
		disciplineLabel: string;
		expiresOn: string | null;
	};
};

export type ProfessionalCredentialRow = {
	candidateId: string;
	name: string;
	disciplineId: string;
	disciplineName: string;
	abbreviation: string | null;
	license: CredentialInput;
	certification: CredentialInput;
};

export type UpcomingShiftRow = ComplianceShift & { candidateId: string; disciplineId: string };

const TRACK_TITLE: Record<CredentialTrack, string> = {
	LICENSE: 'License',
	CERTIFICATION: 'Certification'
};

const SEVERITY_RANK: Record<ComplianceSeverity, number> = {
	CRITICAL: 0,
	BLOCKED: 1,
	ACTION: 2,
	WATCH: 3
};

export function complianceRuleKey(track: CredentialTrack, disciplineId: string): string {
	return `${track}:${disciplineId}`;
}

function graceEndsOn(graceStartedOn: string): string {
	return format(addDays(parseISO(graceStartedOn), LICENSE_GRACE_DAYS), 'yyyy-MM-dd');
}

function describe(
	track: CredentialTrack,
	c: CredentialInput,
	state: CertState,
	today: string
): { detail: string; dueOn: string | null } {
	const noun = TRACK_TITLE[track];
	if (c.expiresOn) {
		const days = daysUntil(c.expiresOn, today);
		if (state === 'EXPIRED') return { detail: `${noun} expired ${c.expiresOn}`, dueOn: c.expiresOn };
		return {
			detail: `${noun} expires ${c.expiresOn} (${days} day${days === 1 ? '' : 's'})`,
			dueOn: c.expiresOn
		};
	}
	if (track === 'CERTIFICATION') {
		return { detail: 'Certification required but no certificate on file', dueOn: null };
	}
	if (!c.graceStartedOn) {
		return { detail: 'No license on file — not yet notified', dueOn: null };
	}
	const ends = graceEndsOn(c.graceStartedOn);
	if (state === 'EXPIRED') {
		return { detail: `No license on file — grace ended ${ends}`, dueOn: ends };
	}
	const left = graceDaysRemaining(c, today) ?? 0;
	return {
		detail: `No license on file — ${left} day${left === 1 ? '' : 's'} of grace left`,
		dueOn: ends
	};
}

function severityFor(state: CertState, hasUpcomingShifts: boolean): ComplianceSeverity | null {
	switch (state) {
		case 'EXPIRED':
			return hasUpcomingShifts ? 'CRITICAL' : 'BLOCKED';
		case 'MISSING_GRACE':
		case 'MISSING':
			return 'ACTION';
		case 'EXPIRING':
			return 'WATCH';
		default:
			return null;
	}
}

/**
 * One item per non-compliant track on one (professional, discipline). VALID and
 * NOT_REQUIRED produce nothing; both tracks lapsing produces two items.
 */
export function classifyProfessional(
	row: ProfessionalCredentialRow,
	shifts: ComplianceShift[],
	today: string
): ComplianceItem[] {
	const items: ComplianceItem[] = [];
	const disciplineLabel = row.abbreviation
		? `${row.disciplineName} (${row.abbreviation})`
		: row.disciplineName;

	for (const track of ['LICENSE', 'CERTIFICATION'] as const) {
		const c = track === 'LICENSE' ? row.license : row.certification;
		const state = credentialState(c, today);
		// Booked shifts only make a lapsed credential worse; they don't create an item.
		const severity = severityFor(state, shifts.length > 0);
		if (!severity) continue;

		const { detail, dueOn } = describe(track, c, state, today);
		items.push({
			subjectType: 'PROFESSIONAL',
			subjectId: row.candidateId,
			subjectName: row.name,
			ruleKey: complianceRuleKey(track, row.disciplineId),
			severity,
			title: `${TRACK_TITLE[track]} · ${disciplineLabel}`,
			detail,
			dueOn,
			upcomingShifts: state === 'EXPIRED' ? shifts : [],
			snoozedUntil: null,
			// A declared certification with no date is an admin slip — there's no
			// message to send the professional for it (same call as certReminders.ts).
			remindable: !(track === 'CERTIFICATION' && !c.expiresOn),
			credential: { track, state, disciplineId: row.disciplineId, disciplineLabel, expiresOn: c.expiresOn }
		});
	}
	return items;
}

/** Attach active snoozes. CRITICAL items can't be snoozed — an expired credential on a booked shift needs fixing. */
export function applySnoozes(
	items: ComplianceItem[],
	snoozes: Map<string, string>,
	today: string
): ComplianceItem[] {
	return items.map((item) => {
		const until = snoozes.get(snoozeKey(item.subjectType, item.subjectId, item.ruleKey));
		const active = until && until >= today && item.severity !== 'CRITICAL';
		return { ...item, snoozedUntil: active ? until : null };
	});
}

export function snoozeKey(subjectType: string, subjectId: string, ruleKey: string): string {
	return `${subjectType}|${subjectId}|${ruleKey}`;
}

/** Most urgent first: severity, then soonest/oldest due date, then name. */
export function sortComplianceItems(items: ComplianceItem[]): ComplianceItem[] {
	return [...items].sort(
		(a, b) =>
			SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
			(a.dueOn ?? '9999').localeCompare(b.dueOn ?? '9999') ||
			a.subjectName.localeCompare(b.subjectName)
	);
}

export type ComplianceSummary = {
	counts: Record<ComplianceSeverity, number>;
	snoozed: number;
	top: ComplianceItem[];
};

/** Widget data: counts of unsnoozed items per severity and the `limit` most urgent. */
export function summarizeCompliance(items: ComplianceItem[], limit = 5): ComplianceSummary {
	const counts: Record<ComplianceSeverity, number> = { CRITICAL: 0, BLOCKED: 0, ACTION: 0, WATCH: 0 };
	const live = items.filter((i) => !i.snoozedUntil);
	for (const item of live) counts[item.severity] += 1;
	return {
		counts,
		snoozed: items.length - live.length,
		top: sortComplianceItems(live).slice(0, limit)
	};
}

export function emptyComplianceSummary(): ComplianceSummary {
	return { counts: { CRITICAL: 0, BLOCKED: 0, ACTION: 0, WATCH: 0 }, snoozed: 0, top: [] };
}
