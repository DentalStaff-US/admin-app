import { invalidate } from '$app/navigation';

export const REFRESH_MS = 60_000;

/**
 * Keep the dashboard fresh while it's open all day (10 §6.1 "Live freshness"):
 * re-run the load every minute while the tab is visible, and on return to the tab
 * if it's been a minute. Returns the cleanup.
 */
export function keepFresh(dependency = 'dashboard:live'): () => void {
	let last = Date.now();
	const refresh = () => {
		last = Date.now();
		void invalidate(dependency);
	};
	const timer = setInterval(() => {
		if (document.visibilityState === 'visible') refresh();
	}, REFRESH_MS);
	const onVisible = () => {
		if (document.visibilityState === 'visible' && Date.now() - last >= REFRESH_MS) refresh();
	};
	document.addEventListener('visibilitychange', onVisible);
	return () => {
		clearInterval(timer);
		document.removeEventListener('visibilitychange', onVisible);
	};
}
