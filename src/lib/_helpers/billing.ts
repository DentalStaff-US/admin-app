// Derived "is billing set up" check. Kept as a function so every call site
// agrees on the rule:
//   - We have a Stripe Customer ID, AND
//   - We're not still mid-flight in a Checkout setup session.
//
// The Stripe webhook flips `stripeCustomerSetupPending` back to false on
// `checkout.session.completed`, so this turns true automatically once the
// client finishes Checkout.
//
// Used by the dashboard banner, the settings billing card, and the onboarding
// billing step to decide whether to nudge the user.

export type BillingSubscriptionLike = {
	stripeCustomerId?: string | null;
	stripeCustomerSetupPending?: boolean | null;
} | null
	| undefined;

export function hasBillingSetup(subscription: BillingSubscriptionLike): boolean {
	if (!subscription) return false;
	if (!subscription.stripeCustomerId) return false;
	if (subscription.stripeCustomerSetupPending) return false;
	return true;
}
