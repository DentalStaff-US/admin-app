import db from '$lib/server/database/drizzle';
import { timeSheetTable, workdayTable } from '$lib/server/database/schemas/requisition';
import { and, eq, isNull, isNotNull, lt } from 'drizzle-orm';
import { logger } from '$lib/server/logger';
import { approveAndInvoiceTimesheet } from '$lib/server/timesheets/approveTimesheet';

const APPROVAL_WINDOW_MS = 24 * 60 * 60 * 1000;

export type AutoApproveCandidate = { timesheetId: string; submittedAt: Date };

/**
 * PENDING timesheets eligible for "silence = consent" auto-approval: those
 * submitted (status DRAFT/DISCREPANCY → PENDING) more than 24h ago, measured from
 * `submittedAt` — NOT the last workday's end. The inner join guarantees at least
 * one non-cancelled workday (we never auto-approve an empty/orphaned sheet), and
 * selectDistinct collapses the per-workday fan-out. Only PENDING qualifies, so a
 * sheet reopened to DRAFT by a late-added day is skipped, and every (re)submission
 * resets `submittedAt`, restarting the 24h clock.
 */
export async function findTimesheetsToAutoApprove(now: Date): Promise<AutoApproveCandidate[]> {
	const cutoff = new Date(now.getTime() - APPROVAL_WINDOW_MS);

	const rows = await db
		.selectDistinct({ timesheetId: timeSheetTable.id, submittedAt: timeSheetTable.submittedAt })
		.from(timeSheetTable)
		.innerJoin(
			workdayTable,
			and(eq(workdayTable.timesheetId, timeSheetTable.id), isNull(workdayTable.cancelledAt))
		)
		.where(
			and(
				eq(timeSheetTable.status, 'PENDING'),
				isNotNull(timeSheetTable.submittedAt),
				lt(timeSheetTable.submittedAt, cutoff)
			)
		);

	return rows
		.filter((r): r is { timesheetId: string; submittedAt: Date } => r.submittedAt !== null)
		.map((r) => ({ timesheetId: r.timesheetId, submittedAt: r.submittedAt }));
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

	for (const { timesheetId, submittedAt } of candidates) {
		try {
			const result = await approveAndInvoiceTimesheet(timesheetId, {
				actorUserId: null,
				autoApproved: { submittedAt }
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
