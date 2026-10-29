/**
 * Compliance vocabulary shared by the server rule (src/lib/server/compliance) and
 * the dashboard widget / page, which can't import runtime values from $lib/server.
 */

export const COMPLIANCE_SEVERITIES = ['CRITICAL', 'BLOCKED', 'ACTION', 'WATCH'] as const;
export type ComplianceSeverity = (typeof COMPLIANCE_SEVERITIES)[number];

export const SEVERITY_LABELS: Record<ComplianceSeverity, string> = {
	CRITICAL: 'Booked & expired',
	BLOCKED: 'Blocked',
	ACTION: 'Needs action',
	WATCH: 'Expiring'
};

export const SNOOZE_DAYS = [7, 14, 30] as const;
