// Open the Stripe setup-mode Checkout in a new tab without losing the app
// tab. The new-tab pattern matters for two reasons:
//   - Stripe Checkout closes itself on completion via /setup-complete, which
//     also clears the new tab — the original app tab is untouched.
//   - The user can bail out of Checkout without losing whatever they were
//     doing in the app.
//
// We open `about:blank` synchronously inside the click handler so popup
// blockers don't intervene, then point that tab at the Stripe URL after the
// async fetch resolves. If anything fails, we close the blank tab.
//
// The caller can pass an `onReturn` callback that fires when the user
// re-focuses the app tab — typically `invalidateAll` so derived billing state
// refreshes after Stripe's webhook lands. The listener self-removes after one
// trigger to avoid double-invalidates.

export type OpenStripeSetupOptions = {
	onReturn?: () => void;
	onError?: (message: string) => void;
	// `replace` tells the server this is a deliberate swap of an existing method
	// (settings → "Replace payment method", or re-authorizing a lapsed ACH
	// mandate) so it issues a fresh Checkout instead of reporting "already set
	// up" — which has no URL and so read as an error to the caller.
	intent?: 'setup' | 'replace';
};

export async function openStripeSetupInNewTab(opts: OpenStripeSetupOptions = {}): Promise<void> {
	if (typeof window === 'undefined') return;

	const newTab = window.open('about:blank', '_blank');
	if (!newTab) {
		opts.onError?.('Please allow popups for this site so we can open Stripe.');
		return;
	}

	try {
		const res = await fetch('/api/stripe/setup-customer-self', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ intent: opts.intent ?? 'setup' })
		});
		if (!res.ok) {
			throw new Error(`Stripe setup endpoint returned ${res.status}`);
		}
		const data = (await res.json()) as { url?: string; alreadySetUp?: boolean; message?: string };
		// A genuine "nothing to do" answer, not a failure — close the tab and let
		// the caller refresh rather than showing a red error.
		if (!data.url && data.alreadySetUp) {
			newTab.close();
			opts.onReturn?.();
			return;
		}
		if (!data.url) {
			throw new Error('No checkout URL returned');
		}
		newTab.location.href = data.url;

		if (opts.onReturn) {
			const handler = () => {
				if (document.visibilityState === 'visible') {
					document.removeEventListener('visibilitychange', handler);
					opts.onReturn?.();
				}
			};
			document.addEventListener('visibilitychange', handler);
		}
	} catch (err) {
		console.error('openStripeSetupInNewTab failed', err);
		newTab.close();
		opts.onError?.('Could not open Stripe setup. Please try again.');
	}
}
