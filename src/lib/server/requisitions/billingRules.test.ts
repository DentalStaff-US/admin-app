import { describe, expect, it } from 'vitest';
import { summarizeBilling, visibleToViewer } from './billingRules';

describe('visibleToViewer', () => {
	const own = { clientId: 'c1', status: 'open' };

	it('admin (no clientId) sees everything, voids included', () => {
		expect(visibleToViewer(own, undefined)).toBe(true);
		expect(visibleToViewer({ clientId: 'c2', status: 'void' }, undefined)).toBe(true);
	});

	it('client sees only their own invoices', () => {
		expect(visibleToViewer(own, 'c1')).toBe(true);
		expect(visibleToViewer(own, 'c2')).toBe(false);
	});

	it('client never sees voided invoices', () => {
		expect(visibleToViewer({ clientId: 'c1', status: 'void' }, 'c1')).toBe(false);
	});
});

describe('summarizeBilling', () => {
	const perm = { status: 'PAYMENT_REQUIRED', permanentPosition: true };
	const inv = (status: string, total: number, paid: number) => ({
		status,
		total,
		amountPaid: paid,
		amountRemaining: Math.round((total - paid) * 100) / 100
	});

	it('flags a filled perm placement with no invoices as unbilled', () => {
		expect(summarizeBilling([], perm)).toEqual({
			totalBilled: 0,
			totalPaid: 0,
			outstanding: 0,
			unbilled: true
		});
	});

	it('still unbilled when the only invoice was voided', () => {
		expect(summarizeBilling([inv('void', 5000, 0)], perm).unbilled).toBe(true);
	});

	it('an open invoice clears unbilled', () => {
		expect(summarizeBilling([inv('open', 5000, 0)], perm).unbilled).toBe(false);
	});

	it('temp reqs and other statuses are never unbilled', () => {
		expect(
			summarizeBilling([], { status: 'PAYMENT_REQUIRED', permanentPosition: false }).unbilled
		).toBe(false);
		expect(summarizeBilling([], { status: 'OPEN', permanentPosition: true }).unbilled).toBe(false);
	});

	it('totals exclude voids and round to cents', () => {
		const s = summarizeBilling(
			[inv('paid', 1000.1, 1000.1), inv('open', 2000.2, 500.05), inv('void', 999, 0)],
			perm
		);
		expect(s.totalBilled).toBe(3000.3);
		expect(s.totalPaid).toBe(1500.15);
		expect(s.outstanding).toBe(1500.15);
	});
});
