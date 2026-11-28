import { getActivityForEntity } from '$lib/server/audit/queries';
import { PRACTICE_LEDGER_ACTIONS, toPracticeLedger, type PracticeLedgerEntry } from '../history';

/** A timesheet's ledger as its practice may see it. Check access to the sheet first. */
export async function getPracticeLedger(timesheetId: string): Promise<PracticeLedgerEntry[]> {
	return toPracticeLedger(await getActivityForEntity('TIMESHEETS', timesheetId, { actions: PRACTICE_LEDGER_ACTIONS }));
}
