/**
 * Compliance page helpers (10 §3.6): severity tones and hints, the severity
 * chips, and the reminder-throttle hint. Pure, so they're tested directly.
 */
import type { StatusTone } from '$tokens/status';
import { COMPLIANCE_SEVERITIES, SEVERITY_LABELS, type ComplianceSeverity } from '$lib/config/compliance';
import type { TabLink } from '$dtss/TabsWithCounts.svelte';

/** The row shape the page receives (ComplianceItem from $lib/server, client-safe subset). */
export type ComplianceRow = {
	subjectId: string;
	subjectName: string;
	ruleKey: string;
	severity: ComplianceSeverity;
	title: string;
	detail: string;
	dueOn: string | null;
	upcomingShifts: { requisitionId: number; recurrenceDayId: string; date: string }[];
	snoozedUntil: string | null;
	remindable: boolean;
	remindedAt?: string | null;
};

/** 10 W3/W4: both credential failures are negative; CRITICAL sorts first and carries an icon. */
export const SEVERITY_TONE: Record<ComplianceSeverity, StatusTone> = {
	CRITICAL: 'negative',
	BLOCKED: 'negative',
	ACTION: 'warning',
	WATCH: 'pending'
};

/** One sentence per severity: what it means and who acts next (03 › Tooltip copy rules). */
export const SEVERITY_HINTS: Record<ComplianceSeverity, string> = {
	CRITICAL: "Expired credential and booked on an upcoming shift. Can't be snoozed.",
	BLOCKED: "Expired credential; they can't be booked until it's renewed.",
	ACTION: 'No credential on file, or the grace period is running. DTSS follows up.',
	WATCH: 'Valid for now but expires soon. A reminder helps them renew in time.'
};

/** Reminders are throttled to one per item per day (server: REMINDER_THROTTLE_MS). */
export const REMINDER_THROTTLE_HOURS = 24;

function ago(ms: number): string {
	const minutes = Math.max(1, Math.round(ms / 60000));
	if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
	const hours = Math.round(minutes / 60);
	return `${hours} hour${hours === 1 ? '' : 's'} ago`;
}

/** W5: why "Remind" is disabled, and when it frees up. */
export function reminderHint(remindedAt: string | null | undefined, now = new Date()): string {
	if (!remindedAt) return 'Emails and texts them asking for the renewed credential.';
	const elapsed = now.getTime() - new Date(remindedAt).getTime();
	const left = REMINDER_THROTTLE_HOURS * 3600000 - elapsed;
	const when = left <= 0 ? 'now' : left < 3600000 ? 'within the hour' : `in ${Math.ceil(left / 3600000)} hours`;
	return `Reminded ${ago(elapsed)}. You can send another ${when}.`;
}

/**
 * Severity chips that filter the list in place. Zero counts are work nobody
 * needs to do, so they're hidden (10 §3.7) unless that chip is the active one.
 */
export function complianceTabs(
	counts: Record<ComplianceSeverity, number>,
	active: ComplianceSeverity | null,
	href: (severity: ComplianceSeverity | null) => string
): TabLink[] {
	const total = COMPLIANCE_SEVERITIES.reduce((sum, s) => sum + counts[s], 0);
	return [
		{ value: 'ALL', label: 'All', href: href(null), count: total },
		...COMPLIANCE_SEVERITIES.filter((s) => counts[s] > 0 || s === active).map((s) => ({
			value: s,
			label: SEVERITY_LABELS[s],
			href: href(s),
			count: counts[s],
			tone: SEVERITY_TONE[s]
		}))
	];
}
