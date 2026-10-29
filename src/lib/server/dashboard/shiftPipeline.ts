/**
 * Requisition Summary for the admin dashboard: temp shifts by status, priced.
 * The pricing lives in `shiftValueRule.ts`; this only reads rows and the fee.
 */

import db from '$lib/server/database/drizzle';
import { and, eq, gte, lt, type SQL } from 'drizzle-orm';
import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';
import { recurrenceDayTable, requisitionTable } from '$lib/server/database/schemas/requisition';
import { adminConfigTable } from '$lib/server/database/schemas/config';
import { resolveAdminFee } from '$lib/server/timesheets/adminFee';
import {
	summarizePipeline,
	type PipelineRange,
	type PipelineSummary
} from '$lib/server/dashboard/shiftValueRule';

const BUSINESS_TIMEZONE = 'America/New_York';

/** [from, to) for the range, or null for all time. Months are ET calendar months. */
function rangeBounds(range: PipelineRange, now: Date = new Date()): [Date, Date] | null {
	if (range === 'all') return null;
	if (range === '30d') return [now, new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)];

	const [year, month] = formatInTimeZone(now, BUSINESS_TIMEZONE, 'yyyy-MM').split('-').map(Number);
	const nextYear = month === 12 ? year + 1 : year;
	const nextMonth = month === 12 ? 1 : month + 1;
	const pad = (n: number) => String(n).padStart(2, '0');
	return [
		fromZonedTime(`${year}-${pad(month)}-01T00:00:00`, BUSINESS_TIMEZONE),
		fromZonedTime(`${nextYear}-${pad(nextMonth)}-01T00:00:00`, BUSINESS_TIMEZONE)
	];
}

export async function getShiftPipelineSummary(range: PipelineRange): Promise<PipelineSummary> {
	const conditions: SQL[] = [
		// Deleted shifts are archived; perm reqs have no shifts and their own card.
		eq(recurrenceDayTable.archived, false),
		eq(requisitionTable.permanentPosition, false)
	];
	const bounds = rangeBounds(range);
	if (bounds) {
		conditions.push(gte(recurrenceDayTable.dayStart, bounds[0]));
		conditions.push(lt(recurrenceDayTable.dayStart, bounds[1]));
	}

	const [shifts, [config]] = await Promise.all([
		db
			.select({
				requisitionId: recurrenceDayTable.requisitionId,
				status: recurrenceDayTable.status,
				dayStart: recurrenceDayTable.dayStart,
				dayEnd: recurrenceDayTable.dayEnd,
				lunchStart: recurrenceDayTable.lunchStart,
				lunchEnd: recurrenceDayTable.lunchEnd,
				hourlyRate: requisitionTable.hourlyRate
			})
			.from(recurrenceDayTable)
			.innerJoin(requisitionTable, eq(requisitionTable.id, recurrenceDayTable.requisitionId))
			.where(and(...conditions)),
		db.select().from(adminConfigTable).limit(1)
	]);

	// Platform fee only — per-timesheet overrides don't exist until a sheet does.
	const fee = resolveAdminFee({
		overrideAmount: null,
		overrideType: null,
		platformAmount: config?.adminPaymentFee,
		platformType: config?.adminPaymentFeeType
	});

	return summarizePipeline(shifts, { amount: fee.amount, type: fee.type });
}
