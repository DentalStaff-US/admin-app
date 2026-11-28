/** Client onboarding steps (03 › Stepper): company → location → staff → billing. */
export const CLIENT_ONBOARDING_STEPS = ['Practice', 'Location', 'Team', 'Billing'] as const;

export type ClientOnboardingStep = 'company' | 'location' | 'staff' | 'billing' | 'complete';

const ORDER: ClientOnboardingStep[] = ['company', 'location', 'staff', 'billing', 'complete'];

/** Stepper index for a step; `complete` is past the last step (everything done). */
export function stepIndex(step: ClientOnboardingStep): number {
	return ORDER.indexOf(step);
}

export type BillingChoice = 'card' | 'bank' | 'paper';

/**
 * What the billing step's main button does for each choice. Card and bank both
 * go through the same Stripe setup (Stripe Checkout offers card and US bank
 * account); paper invoicing is set by DTSS, so it's a request to our team.
 */
export function billingAction(choice: BillingChoice): 'stripe' | 'request-paper' {
	return choice === 'paper' ? 'request-paper' : 'stripe';
}
