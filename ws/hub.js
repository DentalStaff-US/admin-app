// @ts-nocheck
// Real-time inbox signals. Messages can be sent through either app, so a socket on one
// can't see a message saved through the other. Both share Postgres, so InboxService
// publishes with NOTIFY and each app's hub LISTENs and tells that user's sockets.
//
// Sockets carry only "this conversation changed". The page then reloads through its
// normal load, so permissions and practice masking stay in one place. Plain JS because
// both server.js and the Vite dev server load it outside SvelteKit.
import pg from 'pg';
import { WebSocketServer, WebSocket } from 'ws';
import { INBOX_CHANNEL } from './channel.js';
import { verifyTicket } from './ticket.js';

const SOCKET_PATH = '/ws/inbox';
const HEARTBEAT_MS = 30_000;
const MAX_SOCKETS_PER_USER = 10;
const MAX_RECONNECT_MS = 30_000;

/** Browsers send Origin, so a page on another site can't open a socket as this user. */
function sameOrigin(request) {
	const origin = request.headers.origin;
	if (!origin) return true;
	const host = request.headers['x-forwarded-host'] ?? request.headers.host;
	try {
		return new URL(origin).host === host;
	} catch {
		return false;
	}
}

/** Keeps one dedicated connection on LISTEN, reconnecting if it drops. Returns a stop function. */
export function listenForInboxEvents(databaseUrl, onEvent, log = console) {
	let client = null;
	let stopped = false;
	let delay = 1000;
	let timer = null;

	const retry = () => {
		if (stopped) return;
		timer = setTimeout(connect, delay);
		delay = Math.min(delay * 2, MAX_RECONNECT_MS);
	};

	async function connect() {
		const local = /localhost|127\.0\.0\.1/.test(databaseUrl);
		const current = new pg.Client({
			connectionString: databaseUrl,
			ssl: local ? false : { rejectUnauthorized: false },
			keepAlive: true
		});
		client = current;
		let failed = false;
		const onFailure = (err) => {
			if (failed) return;
			failed = true;
			log.error('[inbox-hub] database connection lost', err?.message);
			current.end().catch(() => {});
			retry();
		};
		current.on('error', onFailure);
		current.on('end', () => onFailure());
		current.on('notification', (message) => {
			try {
				onEvent(JSON.parse(message.payload));
			} catch (err) {
				log.error('[inbox-hub] bad event', err?.message);
			}
		});
		try {
			await current.connect();
			await current.query(`LISTEN ${INBOX_CHANNEL}`);
			delay = 1000;
		} catch (err) {
			onFailure(err);
		}
	}

	connect();
	return () => {
		stopped = true;
		clearTimeout(timer);
		client?.removeAllListeners();
		client?.on('error', () => {});
		return client?.end().catch(() => {});
	};
}

/**
 * Serves /ws/inbox on an existing HTTP server. `subscribe(onEvent)` supplies events and
 * returns a stop function; tests inject their own. Other upgrades, such as Vite's HMR,
 * are left alone. Returns a close function.
 */
export function attachInboxHub(server, { secret, databaseUrl, subscribe, log = console }) {
	const sockets = new Map();
	const wss = new WebSocketServer({ noServer: true });

	function deliver({ conversationId, participantIds }) {
		const message = JSON.stringify({ type: 'conversation', conversationId });
		for (const userId of participantIds ?? []) {
			for (const socket of sockets.get(userId) ?? []) {
				if (socket.readyState === WebSocket.OPEN) socket.send(message);
			}
		}
	}

	const stopListening = subscribe
		? subscribe(deliver)
		: listenForInboxEvents(databaseUrl, deliver, log);

	function onUpgrade(request, socket, head) {
		const url = new URL(request.url, 'http://localhost');
		if (url.pathname !== SOCKET_PATH) return;

		const userId = sameOrigin(request) ? verifyTicket(url.searchParams.get('ticket'), secret) : null;
		if (!userId || (sockets.get(userId)?.size ?? 0) >= MAX_SOCKETS_PER_USER) {
			socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
			socket.destroy();
			return;
		}
		wss.handleUpgrade(request, socket, head, (ws) => {
			ws.isAlive = true;
			ws.on('pong', () => (ws.isAlive = true));
			ws.on('error', () => ws.terminate());
			ws.on('close', () => {
				const set = sockets.get(userId);
				set?.delete(ws);
				if (set?.size === 0) sockets.delete(userId);
			});
			if (!sockets.has(userId)) sockets.set(userId, new Set());
			sockets.get(userId).add(ws);
		});
	}
	server.on('upgrade', onUpgrade);

	// Also keeps connections from being dropped as idle by proxies.
	const heartbeat = setInterval(() => {
		for (const set of sockets.values()) {
			for (const ws of set) {
				if (!ws.isAlive) {
					ws.terminate();
					continue;
				}
				ws.isAlive = false;
				ws.ping();
			}
		}
	}, HEARTBEAT_MS);
	heartbeat.unref?.();

	return async () => {
		clearInterval(heartbeat);
		server.off('upgrade', onUpgrade);
		for (const set of sockets.values()) for (const ws of set) ws.terminate();
		wss.close();
		await stopListening?.();
	};
}
