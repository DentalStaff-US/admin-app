import { and, eq, sql } from 'drizzle-orm';
import { invoiceTable, requisitionTable } from '$lib/server/database/schemas/requisition';

/**
 * The one definition of an "unbilled placement": a permanent requisition sitting
 * at PAYMENT_REQUIRED (set when an application is approved) with no live invoice
 * pointing at it. Perm fees are raised by hand, so nothing else catches a
 * placement someone forgot to invoice — there is no cron and no reminder.
 *
 * `status <> 'void'` is the point: a voided invoice is not payment, so a
 * requisition whose only invoice was voided is still unbilled.
 *
 * Shared by the admin dashboard count and the `/requisitions?filter=unbilled`
 * list so the badge and the list it links to can never disagree.
 */
export function unbilledPlacementCondition() {
	return and(
		eq(requisitionTable.permanentPosition, true),
		eq(requisitionTable.status, 'PAYMENT_REQUIRED'),
		sql`not exists (
			select 1
			from ${invoiceTable}
			where ${invoiceTable.requisitionId} = ${requisitionTable.id}
				and ${invoiceTable.status} <> 'void'
		)`
	);
}

/** Same predicate as a selectable boolean column, for flagging rows in a list. */
export function isUnbilledPlacementColumn() {
	return sql<boolean>`coalesce((${unbilledPlacementCondition()}), false)`;
}

export const REQUISITION_LIST_FILTERS = ['unbilled'] as const;
export type RequisitionListFilter = (typeof REQUISITION_LIST_FILTERS)[number];

export function parseRequisitionListFilter(
	value: string | null | undefined
): RequisitionListFilter | null {
	return REQUISITION_LIST_FILTERS.find((f) => f === value) ?? null;
}
