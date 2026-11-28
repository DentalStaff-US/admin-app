/** Timesheets by stage for the admin dashboard, defined by the list's own tabs. */
import type { StatusTone } from '$tokens/status';
import { inTab, TIMESHEET_STAGES, TIMESHEET_TABS } from '$features/timesheets/timesheetList';

export type TimesheetStage = (typeof TIMESHEET_STAGES)[number];
export type TimesheetStageCount = { stage: TimesheetStage; label: string; href: string; tone: StatusTone; count: number; hours: number };

const TONE: Record<TimesheetStage, StatusTone> = {
	draft: 'neutral',
	review: 'pending',
	discrepancies: 'warning',
	approved: 'info',
	paid: 'positive'
};

export const STAGE_HINT: Record<TimesheetStage, string> = {
	draft: 'The professional hasn’t submitted their hours yet.',
	review: 'Submitted and waiting for the practice to approve.',
	discrepancies: 'Sent back with a problem to correct.',
	approved: 'Approved and invoiced; wages not paid yet.',
	paid: 'Approved, and wages marked paid.'
};

/** From counts grouped by status and wages status, so a tile always matches its tab. */
export function timesheetStages(rows: { status: string; wagesStatus: string | null; count: number; hours: number }[]): TimesheetStageCount[] {
	return TIMESHEET_STAGES.map((stage) => {
		const mine = rows.filter((r) => inTab(r, stage));
		return {
			stage,
			label: TIMESHEET_TABS.find((t) => t.value === stage)!.label,
			href: `/timesheets?tab=${stage}`,
			tone: TONE[stage],
			count: mine.reduce((n, r) => n + r.count, 0),
			hours: mine.reduce((n, r) => n + r.hours, 0)
		};
	});
}
