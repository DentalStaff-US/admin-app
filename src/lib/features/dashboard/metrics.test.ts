import { describe, expect, it } from 'vitest';
import { hideWhenZero, METRICS, metricHint, metricWindowText, type MetricId } from './metrics';
import { complianceSection } from './compliance';
import { monthBounds, pickNotice } from './practice';
import { failed, ok } from './types';

describe('metric contract (10 §5)', () => {
	it('gives every metric a label and a one-sentence hint', () => {
		for (const id of Object.keys(METRICS) as MetricId[]) {
			expect(METRICS[id].label.length).toBeGreaterThan(0);
			const hint = metricHint(id, 'month');
			expect(hint.length).toBeGreaterThan(10);
			expect(hint.length).toBeLessThan(160);
		}
	});

	it('prints the window on windowed tiles', () => {
		expect(metricWindowText('fillRate', 'week')).toBe('this week');
		expect(metricHint('fillRate', '30d')).toContain('last 30 days');
		expect(metricWindowText('wagesOwed', 'week')).toBe('right now');
	});
});

describe('hideWhenZero (10 §3.7)', () => {
	it('hides an actionable zero', () => {
		expect(hideWhenZero('actionable', ok(0))).toBe(true);
		expect(hideWhenZero('actionable', ok(3))).toBe(false);
	});
	it('always shows informational numbers and failures', () => {
		expect(hideWhenZero('informational', ok(0))).toBe(false);
		expect(hideWhenZero('actionable', failed())).toBe(false);
	});
});

describe('complianceSection', () => {
	const item = (severity: string, snoozedUntil: string | null = null) => ({
		subjectId: `p-${severity}-${snoozedUntil}`,
		subjectName: 'Maria Chen',
		ruleKey: 'LICENSE:rdh',
		severity,
		title: 'License · RDH',
		detail: 'expires soon',
		snoozedUntil,
		remindable: true
	});

	it('stays a failure when the load failed (never the all-clear, 10 W1)', () => {
		expect(complianceSection(failed())).toEqual({ ok: false });
	});

	it('lists ACTION and WATCH only, counts every severity, and counts snoozes apart', () => {
		const s = complianceSection(ok([item('CRITICAL'), item('BLOCKED'), item('ACTION'), item('WATCH'), item('WATCH', '2026-12-01')]));
		expect(s.ok && s.value.counts).toEqual({ CRITICAL: 1, BLOCKED: 1, ACTION: 1, WATCH: 1 });
		expect(s.ok && s.value.snoozed).toBe(1);
		expect(s.ok && s.value.items.map((i) => i.severity)).toEqual(['ACTION', 'WATCH']);
	});
});

describe('pickNotice (one Notice at most)', () => {
	const base = { status: 'ACTIVE' as const, canCreateRequisitions: true, isOwner: true, billingSetUp: false, invoiceMethod: 'STRIPE' };
	it('puts the account state first', () => {
		expect(pickNotice({ ...base, status: 'PENDING', canCreateRequisitions: false })).toEqual({ kind: 'account', status: 'PENDING' });
	});
	it('asks owners to set up Stripe billing, but never paper-invoiced practices', () => {
		expect(pickNotice(base)).toEqual({ kind: 'billing' });
		expect(pickNotice({ ...base, invoiceMethod: 'PAPER' })).toBeNull();
		expect(pickNotice({ ...base, isOwner: false })).toBeNull();
		expect(pickNotice({ ...base, billingSetUp: true })).toBeNull();
	});
});

describe('monthBounds', () => {
	it('covers the ET calendar month', () => {
		expect(monthBounds(new Date('2026-02-10T12:00:00Z'))).toEqual({ first: '2026-02-01', last: '2026-02-28' });
		// 11pm ET on Nov 30 is still November.
		expect(monthBounds(new Date('2026-12-01T04:00:00Z'))).toEqual({ first: '2026-11-01', last: '2026-11-30' });
	});
});
