/**
 * Ownership checks for requisition form actions. resolveRequisitionAccess
 * proves the caller may act on the request in the URL; these prove the rows a
 * form names (days, the requisitionId field) belong to that same request, so a
 * practice can't post its own URL with another practice's ids.
 */
import { and, eq, inArray } from 'drizzle-orm';
import db from '$lib/server/database/drizzle';
import { recurrenceDayTable } from '$lib/server/database/schemas/requisition';

export async function recurrenceDaysBelongTo(ids: string[], requisitionId: number): Promise<boolean> {
	const unique = [...new Set(ids.filter(Boolean))];
	if (unique.length === 0) return false;
	const rows = await db
		.select({ id: recurrenceDayTable.id })
		.from(recurrenceDayTable)
		.where(and(inArray(recurrenceDayTable.id, unique), eq(recurrenceDayTable.requisitionId, requisitionId)));
	return rows.length === unique.length;
}
