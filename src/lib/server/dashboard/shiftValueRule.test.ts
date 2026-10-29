import { describe, it, expect } from 'vitest';
import {
	estimateShiftValue,
	parsePipelineRange,
	summarizePipeline,
	type PipelineShift
} from '$lib/server/dashboard/shiftValueRule';

// An 8-hour shift, 9:00–17:00 ET on a Monday.
const shift = (over: Partial<PipelineShift> = {}): PipelineShift => ({
	requisitionId: 1,
	status: 'FILLED',
	dayStart: '2026-10-12T13:00:00.000Z',
	dayEnd: '2026-10-12T21:00:00.000Z',
	hourlyRate: 50,
	...over
});

describe('estimateShiftValue', () => {
	it('prices a shift at hours × rate', () => {
		expect(estimateShiftValue(shift())).toEqual({ hours: 8, wagesCents: 40000 });
	});

	it('values a shift with no rate at $0', () => {
		expect(estimateShiftValue(shift({ hourlyRate: null })).wagesCents).toBe(0);
	});
});

describe('summarizePipeline', () => {
	it('adds a percentage fee per shift on top of wages', () => {
		const s = summarizePipeline([shift(), shift()], { amount: 35, type: 'PERCENTAGE' });
		expect(s.FILLED).toEqual({
			count: 2,
			wagesCents: 80000,
			marginCents: 28000,
			billingCents: 108000
		});
	});

	it('charges a fixed fee once per requisition-week', () => {
		const tuesday = { dayStart: '2026-10-13T13:00:00.000Z', dayEnd: '2026-10-13T21:00:00.000Z' };
		const nextWeek = { dayStart: '2026-10-19T13:00:00.000Z', dayEnd: '2026-10-19T21:00:00.000Z' };
		const s = summarizePipeline(
			[shift(), shift(tuesday), shift(nextWeek), shift({ requisitionId: 2 })],
			{ amount: 250, type: 'FIXED' }
		);
		// req 1 week 42, req 1 week 43, req 2 week 42 → three fees.
		expect(s.FILLED.marginCents).toBe(75000);
	});

	it('treats a waived (0) fee as no margin', () => {
		const s = summarizePipeline([shift()], { amount: 0, type: 'PERCENTAGE' });
		expect(s.FILLED.marginCents).toBe(0);
		expect(s.FILLED.billingCents).toBe(40000);
	});

	it('still counts a shift with no rate', () => {
		const s = summarizePipeline([shift({ status: 'OPEN', hourlyRate: null })], {
			amount: 35,
			type: 'PERCENTAGE'
		});
		expect(s.OPEN).toEqual({ count: 1, wagesCents: 0, marginCents: 0, billingCents: 0 });
	});

	it('buckets by status and ignores unknown statuses', () => {
		const s = summarizePipeline(
			[shift({ status: 'OPEN' }), shift({ status: 'CANCELED' }), shift({ status: 'BOGUS' })],
			{ amount: 0, type: 'PERCENTAGE' }
		);
		expect(s.OPEN.count).toBe(1);
		expect(s.CANCELED.count).toBe(1);
		expect(s.FILLED.count + s.UNFULFILLED.count).toBe(0);
	});
});

describe('parsePipelineRange', () => {
	it('accepts known ranges and defaults to this month', () => {
		expect(parsePipelineRange('30d')).toBe('30d');
		expect(parsePipelineRange('all')).toBe('all');
		expect(parsePipelineRange('nope')).toBe('month');
		expect(parsePipelineRange(null)).toBe('month');
	});
});
