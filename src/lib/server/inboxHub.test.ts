import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { attachInboxHub } from '../../../ws/hub.js';
import { createTicket, verifyTicket } from '../../../ws/ticket.js';

const SECRET = 'test-secret';

describe('tickets', () => {
	it('round-trips a user id', () => {
		expect(verifyTicket(createTicket('u1', SECRET), SECRET)).toBe('u1');
	});
	it('rejects a tampered ticket', () => {
		const [payload, signature] = createTicket('u1', SECRET).split('.');
		const forged = Buffer.from(JSON.stringify({ userId: 'admin', exp: Date.now() + 60000 })).toString('base64url');
		expect(verifyTicket(`${forged}.${signature}`, SECRET)).toBeNull();
		expect(verifyTicket(`${payload}.x`, SECRET)).toBeNull();
		expect(verifyTicket('nonsense', SECRET)).toBeNull();
		expect(verifyTicket(null, SECRET)).toBeNull();
	});
	it('rejects another secret', () => {
		expect(verifyTicket(createTicket('u1', SECRET), 'other')).toBeNull();
	});
	it('expires', () => {
		const ticket = createTicket('u1', SECRET, 1000);
		expect(verifyTicket(ticket, SECRET, 2000)).toBe('u1');
		expect(verifyTicket(ticket, SECRET, 1000 + 61_000)).toBeNull();
	});
});

describe('inbox hub', () => {
	let server: Server;
	let close: () => Promise<void>;
	let emit: (event: { conversationId: string; participantIds: string[] }) => void;
	let port: number;
	const open: WebSocket[] = [];

	beforeEach(async () => {
		server = createServer();
		close = attachInboxHub(server, {
			secret: SECRET,
			subscribe: (onEvent: typeof emit) => {
				emit = onEvent;
				return () => {};
			}
		});
		await new Promise<void>((resolve) => server.listen(0, resolve));
		port = (server.address() as AddressInfo).port;
	});
	afterEach(async () => {
		open.splice(0).forEach((ws) => ws.terminate());
		await close();
		await new Promise((resolve) => server.close(resolve));
	});

	const connect = (ticket: string, headers: Record<string, string> = {}) => {
		const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/inbox?ticket=${encodeURIComponent(ticket)}`, { headers });
		open.push(ws);
		return new Promise<WebSocket>((resolve, reject) => {
			ws.once('open', () => resolve(ws));
			ws.once('error', reject);
		});
	};
	const nextMessage = (ws: WebSocket) =>
		new Promise<any>((resolve) => ws.once('message', (data) => resolve(JSON.parse(String(data)))));

	it('tells participants which conversation changed, and nothing about its content', async () => {
		const ws = await connect(createTicket('u1', SECRET));
		const received = nextMessage(ws);
		emit({ conversationId: 'c1', participantIds: ['u1', 'u2'] });
		expect(await received).toEqual({ type: 'conversation', conversationId: 'c1' });
	});

	it("doesn't tell anyone else", async () => {
		const outsider = await connect(createTicket('u3', SECRET));
		const participant = await connect(createTicket('u1', SECRET));
		let leaked = false;
		outsider.once('message', () => (leaked = true));
		const received = nextMessage(participant);
		emit({ conversationId: 'c1', participantIds: ['u1'] });
		await received;
		await new Promise((resolve) => setTimeout(resolve, 30));
		expect(leaked).toBe(false);
	});

	it('reaches every tab the user has open', async () => {
		const [a, b] = await Promise.all([connect(createTicket('u1', SECRET)), connect(createTicket('u1', SECRET))]);
		const both = Promise.all([nextMessage(a), nextMessage(b)]);
		emit({ conversationId: 'c1', participantIds: ['u1'] });
		await expect(both).resolves.toHaveLength(2);
	});

	it('refuses a bad ticket', async () => {
		await expect(connect('forged.ticket')).rejects.toThrow(/401/);
	});

	it('refuses a page on another site', async () => {
		await expect(connect(createTicket('u1', SECRET), { origin: 'https://evil.example' })).rejects.toThrow(/401/);
	});

	it('accepts its own site', async () => {
		await expect(connect(createTicket('u1', SECRET), { origin: `http://127.0.0.1:${port}` })).resolves.toBeDefined();
	});

	it('leaves other upgrade paths alone', async () => {
		let seen = false;
		server.on('upgrade', (request, socket) => {
			if (request.url === '/other') {
				seen = true;
				socket.destroy();
			}
		});
		const ws = new WebSocket(`ws://127.0.0.1:${port}/other`);
		await new Promise((resolve) => ws.once('error', resolve));
		expect(seen).toBe(true);
	});
});
