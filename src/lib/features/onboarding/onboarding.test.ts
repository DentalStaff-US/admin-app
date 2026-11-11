import { describe, expect, it } from 'vitest';
import { billingAction, CLIENT_ONBOARDING_STEPS, stepIndex } from './onboarding';

describe('client onboarding steps', () => {
	it('has four steps in funnel order', () => {
		expect(CLIENT_ONBOARDING_STEPS).toEqual(['Practice', 'Location', 'Team', 'Billing']);
		expect(stepIndex('company')).toBe(0);
		expect(stepIndex('billing')).toBe(3);
	});

	it('marks every step done on the completion screen', () => {
		expect(stepIndex('complete')).toBe(CLIENT_ONBOARDING_STEPS.length);
	});
});

describe('billingAction', () => {
	it('sends card and bank to Stripe and paper to our team', () => {
		expect(billingAction('card')).toBe('stripe');
		expect(billingAction('bank')).toBe('stripe');
		expect(billingAction('paper')).toBe('request-paper');
	});
});
