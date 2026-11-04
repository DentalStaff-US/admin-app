import { invalidate } from '$app/navigation';

const MAX_RETRY_MS = 30_000;
let connected = false;

/** Polling only runs while this is false, so a blocked socket degrades instead of breaking. */
export const inboxSocketConnected = () => connected;

function refresh() {
	invalidate('inbox:list');
	invalidate('inbox:unread');
	// Loading a thread marks it read, so a thread in a background tab must wait until
	// someone can see it. That also keeps their email alert accurate.
	if (document.visibilityState === 'visible') invalidate('inbox:conversation');
}

/** Opens the inbox socket and keeps it open. Returns a stop function. */
export function connectInboxSocket(): () => void {
	let socket: WebSocket | null = null;
	let stopped = false;
	let delay = 1000;
	let timer: ReturnType<typeof setTimeout> | undefined;

	function retry() {
		connected = false;
		if (stopped) return;
		timer = setTimeout(open, delay);
		delay = Math.min(delay * 2, MAX_RETRY_MS);
	}

	async function open() {
		try {
			const res = await fetch('/api/inbox/socket-ticket');
			if (!res.ok) throw new Error(`ticket ${res.status}`);
			const { ticket } = await res.json();
			if (stopped) return;
			const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
			socket = new WebSocket(`${scheme}://${location.host}/ws/inbox?ticket=${encodeURIComponent(ticket)}`);
			socket.onopen = () => {
				connected = true;
				delay = 1000;
				// Catch up on anything sent while disconnected.
				refresh();
			};
			socket.onmessage = refresh;
			socket.onclose = retry;
		} catch {
			retry();
		}
	}

	function onVisible() {
		if (document.visibilityState === 'visible') invalidate('inbox:conversation');
	}
	document.addEventListener('visibilitychange', onVisible);
	open();

	return () => {
		stopped = true;
		connected = false;
		clearTimeout(timer);
		document.removeEventListener('visibilitychange', onVisible);
		if (socket) {
			socket.onclose = null;
			socket.close();
		}
	};
}
