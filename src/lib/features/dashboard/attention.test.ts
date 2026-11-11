import { describe, expect, it } from 'vitest';
import { adminSummaryLine, attentionSummary, buildAttentionQueue, compareAttention, KIND_META, limitRows, parseAttentionFilter } from './attention';
import { ATTENTION_KINDS, type AttentionGroup, type AttentionItem, type AttentionKind } from './types';

const item = (kind: AttentionKind, id: string, over: Partial<AttentionItem> = {}): AttentionItem => ({
	id: `${kind}:${id}`,
	kind,
	tone: KIND_META[kind].tone,
	title: id,
	detail: '',
	since: new Date('2026-11-01T00:00:00Z'),
	href: `/x/${id}`,
	action: { label: 'Open', href: `/x/${id}` },
	...over
});

const group = (kind: AttentionKind, count: number, items: AttentionItem[]): AttentionGroup => ({
	kind,
	result: { ok: true, value: { count, items } }
});

describe('KIND_META', () => {
	it('describes every kind', () => {
		for (const kind of ATTENTION_KINDS) {
			expect(KIND_META[kind].noun.length).toBeGreaterThan(0);
			expect(KIND_META[kind].priority).toBeGreaterThan(0);
		}
	});
});

describe('buildAttentionQueue', () => {
	it('takes counts from the query, not from the rows it was given', () => {
		const q = buildAttentionQueue([group('PRO_PENDING_APPROVAL', 40, [item('PRO_PENDING_APPROVAL', 'a')])]);
		expect(q.total).toBe(40);
		expect(q.overflow).toEqual([
			{ kind: 'PRO_PENDING_APPROVAL', noun: KIND_META.PRO_PENDING_APPROVAL.noun, count: 40, href: '/professionals?status=PENDING' }
		]);
	});

	it('gives an empty kind no chip (zero-state hiding)', () => {
		const q = buildAttentionQueue([
			group('SUPPORT_OPEN', 0, []),
			group('TIMESHEET_PENDING', 2, [item('TIMESHEET_PENDING', 'a'), item('TIMESHEET_PENDING', 'b')])
		]);
		expect(q.chips.map((c) => c.value)).toEqual(['all', 'timesheets']);
	});

	it('is all clear only when every kind loaded and none has work', () => {
		expect(buildAttentionQueue([group('SUPPORT_OPEN', 0, [])]).allClear).toBe(true);
		const withFailure = buildAttentionQueue([group('SUPPORT_OPEN', 0, []), { kind: 'INVOICE_OVERDUE', result: { ok: false } }]);
		expect(withFailure.allClear).toBe(false);
		expect(withFailure.failedKinds).toEqual(['INVOICE_OVERDUE']);
	});

	it('filters by category and sorts by priority, then by date', () => {
		const groups = [
			group('SUPPORT_OPEN', 1, [item('SUPPORT_OPEN', 's')]),
			group('UNFILLED_SOON', 2, [
				item('UNFILLED_SOON', 'late', { dueAt: new Date('2026-11-11T15:00:00Z') }),
				item('UNFILLED_SOON', 'soon', { dueAt: new Date('2026-11-10T15:00:00Z') })
			]),
			group('INVOICE_OVERDUE', 1, [item('INVOICE_OVERDUE', 'i')])
		];
		expect(buildAttentionQueue(groups).items.map((i) => i.title)).toEqual(['soon', 'late', 'i', 's']);
		expect(buildAttentionQueue(groups, 'billing').items.map((i) => i.title)).toEqual(['i']);
		expect(buildAttentionQueue(groups, 'billing').total).toBe(4);
	});

	it('drops optimistically removed rows from both list and count', () => {
		const q = buildAttentionQueue(
			[group('TIMESHEET_PENDING', 2, [item('TIMESHEET_PENDING', 'a'), item('TIMESHEET_PENDING', 'b')])],
			'all',
			new Set(['TIMESHEET_PENDING:a'])
		);
		expect(q.total).toBe(1);
		expect(q.items).toHaveLength(1);
		expect(q.chips.find((c) => c.value === 'timesheets')?.count).toBe(1);
	});

	it('puts critical compliance alongside unfilled shifts, ahead of discrepancies', () => {
		const a = item('COMPLIANCE_CRITICAL', 'c');
		const b = item('TIMESHEET_DISCREPANCY', 'd');
		expect(compareAttention(a, b)).toBeLessThan(0);
	});
});

describe('limitRows', () => {
	it('shows 10, then the rest on expand', () => {
		const rows = Array.from({ length: 13 }, (_, i) => i);
		expect(limitRows(rows, false)).toEqual({ shown: rows.slice(0, 10), hidden: 3 });
		expect(limitRows(rows, true)).toEqual({ shown: rows, hidden: 0 });
	});
});

describe('parseAttentionFilter', () => {
	it('accepts known categories only', () => {
		expect(parseAttentionFilter('billing')).toBe('billing');
		expect(parseAttentionFilter('nope')).toBe('all');
	});
});

describe('adminSummaryLine', () => {
	it('summarises the urgent kinds, or nothing', () => {
		expect(adminSummaryLine([group('UNFILLED_SOON', 5, []), group('TIMESHEET_PENDING', 3, [])])).toBe(
			'5 shifts in the next 48h are still open · 3 timesheets waiting on you'
		);
		expect(adminSummaryLine([group('SUPPORT_OPEN', 2, [])])).toBeNull();
	});
});

describe('attentionSummary', () => {
	it('keeps kinds with work, most urgent first, and reports failures', () => {
		const s = attentionSummary([
			{ kind: 'TIMESHEET_PENDING', result: { ok: true, value: { count: 12, items: [] } } },
			{ kind: 'SUPPORT_OPEN', result: { ok: true, value: { count: 0, items: [] } } },
			{ kind: 'COMPLIANCE_CRITICAL', result: { ok: true, value: { count: 2, items: [] } } },
			{ kind: 'INVOICE_OVERDUE', result: { ok: false } }
		]);
		expect(s.rows.map((r) => [r.label, r.count])).toEqual([
			['Expired credentials', 2],
			['Timesheets to review', 12]
		]);
		expect(s.total).toBe(14);
		expect(s.failedKinds).toEqual(['INVOICE_OVERDUE']);
		expect(s.rows[1].href).toBe('/timesheets?tab=review');
	});
});
