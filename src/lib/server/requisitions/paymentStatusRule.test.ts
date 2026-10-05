import { describe, it, expect } from 'vitest';
import { decidePaymentStatus } from '$lib/server/requisitions/paymentStatusRule';

const paid = (amountRemaining = '0.00') => ({ status: 'paid', amountRemaining });
const open = (amountRemaining = '3500.00') => ({ status: 'open', amountRemaining });

describe('decidePaymentStatus', () => {
	it('leaves the status alone when nothing is billed', () => {
		// No live invoices: the fee is still owed, so PAYMENT_REQUIRED stays put.
		expect(decidePaymentStatus([])).toBeNull();
	});

	it('marks received when every invoice is settled', () => {
		// Req #45's shape: two paid Stripe invoices on one placement.
		expect(decidePaymentStatus([paid(), paid()])).toBe('PAYMENT_RECEIVED');
	});

	it('stays required while any invoice is unpaid', () => {
		expect(decidePaymentStatus([paid(), open()])).toBe('PAYMENT_REQUIRED');
	});

	it('stays required for a single open invoice', () => {
		expect(decidePaymentStatus([open()])).toBe('PAYMENT_REQUIRED');
	});

	it('reopens when a refund leaves a balance on a paid invoice', () => {
		// The lagging-status case: still flagged paid, but money is owed again.
		expect(decidePaymentStatus([paid('250.00')])).toBe('PAYMENT_REQUIRED');
	});

	it('tolerates a null balance on a paid invoice', () => {
		expect(decidePaymentStatus([{ status: 'paid', amountRemaining: null }])).toBe(
			'PAYMENT_RECEIVED'
		);
	});

	it('treats a negative balance (overpayment) as settled', () => {
		expect(decidePaymentStatus([paid('-25.00')])).toBe('PAYMENT_RECEIVED');
	});

	it('does not count uncollectible as settled', () => {
		expect(decidePaymentStatus([{ status: 'uncollectible', amountRemaining: '3000.00' }])).toBe(
			'PAYMENT_REQUIRED'
		);
	});
});
