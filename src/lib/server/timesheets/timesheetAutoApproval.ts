import db from '$lib/server/database/drizzle';
import {
	recurrenceDayTable,
	timeSheetTable,
	workdayTable
} from '$lib/server/database/schemas/requisition';
import { and, eq, isNull } from 'drizzle-orm';
import { logger } from '$lib/server/logger';
import { approveAndInvoiceTimesheet } from '$lib/server/timesheets/approveTimesheet';

const APPROVAL_WINDOW_MS = 24 * 60 * 60 * 1000;

export type AutoApproveCandidate = { timesheetId: string; lastWorkdayEndedAt: Date };

/**
 * PENDING timesheets eligible for "silence = consent" auto-approval: those whose
 * latest non-cancelled workday ended more than 24h ago. The inner joins also
 * guarantee the timesheet has at least one non-cancelled workday (we never
 * auto-approve an empty/orphaned sheet). Only PENDING qualifies, so a sheet
 * reopened to DRAFT by a late-added day is skipped.
 */
export async function findTimesheetsToAutoApprove(now: Date): Promise<AutoApproveCandidate[]> {
	const cutoff = new Date(now.getTime() - APPROVAL_WINDOW_MS);

	const rows = await db
		.select({ timesheetId: timeSheetTable.id, dayEnd: recurrenceDayTable.dayEnd })
		.from(timeSheetTable)
		.innerJoin(
			workdayTable,
			and(eq(workdayTable.timesheetId, timeSheetTable.id), isNull(workdayTable.cancelledAt))
		)
		.innerJoin(recurrenceDayTable, eq(recurrenceDayTable.id, workdayTable.recurrenceDayId))
		.where(eq(timeSheetTable.status, 'PENDING'));

	// Reduce to the latest workday end per timesheet, then keep only those whose
	// last shift ended before the 24h cutoff.
	const lastEndByTimesheet = new Map<string, Date>();
	for (const row of rows) {
		const current = lastEndByTimesheet.get(row.timesheetId);
		if (!current || row.dayEnd > current) {
			lastEndByTimesheet.set(row.timesheetId, row.dayEnd);
		}
	}

	return [...lastEndByTimesheet.entries()]
		.filter(([, lastEnd]) => lastEnd < cutoff)
		.map(([timesheetId, lastWorkdayEndedAt]) => ({ timesheetId, lastWorkdayEndedAt }));
}

/**
 * Approve each eligible timesheet via the shared {@link approveAndInvoiceTimesheet}
 * (actor = null/system, with the auto-approval audit context). Each runs in its
 * own try/catch so one failure can't stop the batch; non-`ok` results (pending
 * expenses, $0, missing Stripe customer, etc.) are skipped and logged rather
 * than approved.
 */
export async function autoApproveTimesheets(
	candidates: AutoApproveCandidate[]
): Promise<{ approved: string[]; skipped: Array<{ timesheetId: string; reason: string }> }> {
	const approved: string[] = [];
	const skipped: Array<{ timesheetId: string; reason: string }> = [];

	for (const { timesheetId, lastWorkdayEndedAt } of candidates) {
		try {
			const result = await approveAndInvoiceTimesheet(timesheetId, {
				actorUserId: null,
				autoApproved: { lastWorkdayEndedAt }
			});
			if (result.ok) {
				approved.push(timesheetId);
			} else {
				skipped.push({ timesheetId, reason: result.reason });
			}
		} catch (err) {
			logger.error('autoApproveTimesheets: timesheet failed', { error: err, timesheetId });
			skipped.push({ timesheetId, reason: 'ERROR' });
		}
	}

	if (approved.length > 0 || skipped.length > 0) {
		logger.event?.('timesheet_auto_approval_ran', {
			approvedCount: approved.length,
			skippedCount: skipped.length,
			skipped
		});
	}

	return { approved, skipped };
}
