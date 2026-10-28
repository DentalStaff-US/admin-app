/**
 * What a temp shift is worth, for the admin dashboard's Requisition Summary.
 *
 * Kept free of DB/env imports so it can be tested directly; `shiftPipeline.ts`
 * reads the rows and the platform fee and hands them here.
 *
 * THE ESTIMATE:
 *   hours   = calculateMaxHours(shift) — the same span the timesheet UI caps at
 *             (lunch is NOT deducted there today, so it isn't here either).
 *   wages   = hours × requisitions.hourly_rate (the professional's rate).
 *   margin  = the platform admin fee: a PERCENTAGE of each shift's wages, or a
 *             FIXED amount once per (requisition, work week) — FIXED is charged per
 *             timesheet, and a timesheet is one requisition-week.
 *   billing = wages + margin — what the client would be invoiced.
 *
 * Weekly overtime is not modelled (it depends on the whole week, not one shift),
 * so every figure is an estimate and the UI says so.
 */

import { formatInTimeZone } from 'date-fns-tz';
import { calculateMaxHours } from '$lib/_helpers/UTCTimezoneUtils';
import { calculateAdminFeeCents, type AdminFeeType } from '$lib/server/timesheets/adminFee';

export const PIPELINE_STATUSES = ['OPEN', 'FILLED', 'UNFULFILLED', 'CANCELED'] as const;
export type PipelineStatus = (typeof PIPELINE_STATUSES)[number];

export const PIPELINE_RANGES = ['30d', 'month', 'all'] as const;
export type PipelineRange = (typeof PIPELINE_RANGES)[number];

export function parsePipelineRange(value: string | null | undefined): PipelineRange {
	return (PIPELINE_RANGES as readonly string[]).includes(value ?? '')
		? (value as PipelineRange)
		: 'month';
}

export type PipelineShift = {
	requisitionId: number | null;
	status: string;
	dayStart: Date | string;
	dayEnd: Date | string;
	lunchStart?: Date | string | null;
	lunchEnd?: Date | string | null;
	hourlyRate: number | null;
};

export type PipelineFee = { amount: number; type: AdminFeeType };

export type PipelineBucket = {
	count: number;
	wagesCents: number;
	marginCents: number;
	billingCents: number;
};

export type PipelineSummary = Record<PipelineStatus, PipelineBucket>;

const WEEK_TIMEZONE = 'America/New_York';

export function estimateShiftValue(shift: PipelineShift): { hours: number; wagesCents: number } {
	const hours = calculateMaxHours(shift);
	const rate = shift.hourlyRate ?? 0;
	return { hours, wagesCents: Math.round(hours * rate * 100) };
}

function emptyBucket(): PipelineBucket {
	return { count: 0, wagesCents: 0, marginCents: 0, billingCents: 0 };
}

export function emptyPipelineSummary(): PipelineSummary {
	return {
		OPEN: emptyBucket(),
		FILLED: emptyBucket(),
		UNFULFILLED: emptyBucket(),
		CANCELED: emptyBucket()
	};
}

/** Group shifts by status and price each bucket. Unknown statuses are ignored. */
export function summarizePipeline(shifts: PipelineShift[], fee: PipelineFee): PipelineSummary {
	const summary = emptyPipelineSummary();
	// FIXED fees are counted once per requisition-week within a bucket.
	const fixedWeeks: Record<PipelineStatus, Set<string>> = {
		OPEN: new Set(),
		FILLED: new Set(),
		UNFULFILLED: new Set(),
		CANCELED: new Set()
	};

	for (const shift of shifts) {
		if (!(PIPELINE_STATUSES as readonly string[]).includes(shift.status)) continue;
		const status = shift.status as PipelineStatus;
		const bucket = summary[status];
		const { wagesCents } = estimateShiftValue(shift);

		bucket.count += 1;
		bucket.wagesCents += wagesCents;

		if (fee.type === 'PERCENTAGE') {
			bucket.marginCents += calculateAdminFeeCents(wagesCents, fee.amount, 'PERCENTAGE');
		} else {
			const week = formatInTimeZone(new Date(shift.dayStart), WEEK_TIMEZONE, "RRRR-'W'II");
			const key = `${shift.requisitionId ?? 'none'}:${week}`;
			if (!fixedWeeks[status].has(key)) {
				fixedWeeks[status].add(key);
				bucket.marginCents += calculateAdminFeeCents(wagesCents, fee.amount, 'FIXED');
			}
		}
	}

	for (const status of PIPELINE_STATUSES) {
		const bucket = summary[status];
		bucket.billingCents = bucket.wagesCents + bucket.marginCents;
	}
	return summary;
}
