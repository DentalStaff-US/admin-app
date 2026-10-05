import { describe, it, expect } from 'vitest';
import {
	decideBillingReadiness,
	billingMethodMismatchMessage
} from '$lib/server/billing/readiness';

describe('decideBillingReadiness', () => {
	it('flags PAPER with a Stripe customer as a mismatch', () => {
		// The case behind the incident: billing works, but every invoice — approved
		// timesheets included — comes out as paper while a usable customer sits idle.
		expect(decideBillingReadiness({ invoiceMethod: 'PAPER', stripeCustomerId: 'cus_123' })).toEqual(
			{
				ready: true,
				method: 'PAPER',
				stripeCustomerId: 'cus_123',
				mismatch: true
			}
		);
	});

	it('does not flag PAPER without a Stripe customer', () => {
		expect(decideBillingReadiness({ invoiceMethod: 'PAPER', stripeCustomerId: null })).toEqual({
			ready: true,
			method: 'PAPER',
			stripeCustomerId: null,
			mismatch: false
		});
	});

	it('does not flag STRIPE with a Stripe customer', () => {
		expect(
			decideBillingReadiness({ invoiceMethod: 'STRIPE', stripeCustomerId: 'cus_123' })
		).toEqual({
			ready: true,
			method: 'STRIPE',
			stripeCustomerId: 'cus_123',
			mismatch: false
		});
	});

	it('is not ready on STRIPE with no customer', () => {
		expect(decideBillingReadiness({ invoiceMethod: 'STRIPE', stripeCustomerId: null })).toEqual({
			ready: false,
			method: 'STRIPE',
			reason: 'NO_STRIPE_CUSTOMER'
		});
	});

	it('treats a null invoice method as STRIPE (the column default)', () => {
		expect(decideBillingReadiness({ invoiceMethod: null, stripeCustomerId: null })).toEqual({
			ready: false,
			method: 'STRIPE',
			reason: 'NO_STRIPE_CUSTOMER'
		});
	});

	it('keeps PAPER authoritative — a Stripe customer never overrides it', () => {
		const result = decideBillingReadiness({
			invoiceMethod: 'PAPER',
			stripeCustomerId: 'cus_123'
		});
		expect(result.method).toBe('PAPER');
	});
});

describe('billingMethodMismatchMessage', () => {
	it('names the company and the fix for admins', () => {
		const msg = billingMethodMismatchMessage({ audience: 'ADMIN', companyName: 'Bright Smiles' });
		expect(msg).toContain('Bright Smiles');
		expect(msg).toContain('paper');
		// Must not read as a blocker — nothing is actually blocked here.
		expect(msg).not.toContain('Cannot');
	});

	it('falls back to a generic subject with no company name', () => {
		expect(billingMethodMismatchMessage({ audience: 'ADMIN' })).toContain('This client');
	});

	it('addresses the client in the second person', () => {
		expect(billingMethodMismatchMessage({ audience: 'CLIENT' })).toContain('Your account');
	});
});
