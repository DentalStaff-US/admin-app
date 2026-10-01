/**
 * When a permanent requisition's invoices say the placement is paid.
 *
 * Kept free of imports on purpose: `paymentStatus.ts` reaches the database and the
 * logger (which pulls `$app/environment`, and with it the SvelteKit client runtime),
 * so the rule lives here where it can be tested directly — the same split as
 * `affiliate/eligibility.ts`.
 *
 * `null` means "leave the status alone": no live invoices at all, so nothing has
 * been billed and PAYMENT_REQUIRED is still the truth.
 *
 * Settled requires BOTH `status === 'paid'` and a zero-or-less balance. The two are
 * written together on every payment path, but a partial refund can reopen the
 * balance while the status lags — and that is exactly the case that must flip back.
 */
export function decidePaymentStatus(
	invoices: { status: string; amountRemaining: string | null }[]
): 'PAYMENT_REQUIRED' | 'PAYMENT_RECEIVED' | null {
	if (invoices.length === 0) return null;

	const settled = invoices.every(
		(i) => i.status === 'paid' && parseFloat(String(i.amountRemaining ?? '0')) <= 0
	);
	return settled ? 'PAYMENT_RECEIVED' : 'PAYMENT_REQUIRED';
}
