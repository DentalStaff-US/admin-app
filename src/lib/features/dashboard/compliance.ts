/**
 * The dashboard's Compliance section (10 §3.6), pure: CRITICAL and BLOCKED go to
 * Needs attention, so this section lists ACTION and WATCH only.
 */
import type { ComplianceSeverityKey, Metric } from './types';

export type ComplianceRow = {
	key: string;
	subjectId: string;
	subjectName: string;
	ruleKey: string;
	severity: ComplianceSeverityKey;
	title: string;
	detail: string;
	remindable: boolean;
	remindedAt: string | null;
};

export type ComplianceSectionData = {
	counts: Record<ComplianceSeverityKey, number>;
	snoozed: number;
	/** ACTION and WATCH, unsnoozed, most urgent first. */
	items: ComplianceRow[];
};

export type ComplianceInput = {
	subjectId: string;
	subjectName: string;
	ruleKey: string;
	severity: string;
	title: string;
	detail: string;
	snoozedUntil: string | null;
	remindable: boolean;
	remindedAt?: string | null;
};

export const SECTION_SEVERITIES = ['ACTION', 'WATCH'] as const;
export const SECTION_LIMIT = 20;

export function complianceSection(items: Metric<ComplianceInput[]>): Metric<ComplianceSectionData> {
	if (!items.ok) return { ok: false };
	const counts: Record<ComplianceSeverityKey, number> = { CRITICAL: 0, BLOCKED: 0, ACTION: 0, WATCH: 0 };
	let snoozed = 0;
	const rows: ComplianceRow[] = [];
	for (const item of items.value) {
		if (item.snoozedUntil) {
			snoozed++;
			continue;
		}
		const severity = item.severity as ComplianceSeverityKey;
		if (!(severity in counts)) continue;
		counts[severity]++;
		if ((SECTION_SEVERITIES as readonly string[]).includes(severity) && rows.length < SECTION_LIMIT) {
			rows.push({
				key: `${item.subjectId}:${item.ruleKey}`,
				subjectId: item.subjectId,
				subjectName: item.subjectName,
				ruleKey: item.ruleKey,
				severity,
				title: item.title,
				detail: item.detail,
				remindable: item.remindable,
				remindedAt: item.remindedAt ?? null
			});
		}
	}
	return { ok: true, value: { counts, snoozed, items: rows } };
}
