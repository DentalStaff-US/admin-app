import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- mocks -----------------------------------------------------------------

// vi.mock factories are hoisted, so everything they reference lives in vi.hoisted.
const { state, fakeDb, eventRef } = vi.hoisted(() => {
	// A minimal chainable stand-in for the Drizzle client. `selectResult` is what
	// the next select().from()...limit() resolves to; `inserted` collects the
	// values() of every insert.
	const state = {
		selectResult: [] as unknown[],
		inserted: [] as Record<string, unknown>[],
		insertShouldThrow: false
	};

	function chain(resolveTo: () => unknown) {
		const c: Record<string, unknown> = {};
		for (const m of ['select', 'from', 'where', 'limit', 'orderBy', 'offset']) {
			c[m] = () => c;
		}
		c.then = (res: (v: unknown) => void, rej: (e: unknown) => void) =>
			Promise.resolve().then(resolveTo).then(res, rej);
		return c;
	}

	const fakeDb = {
		select: () => chain(() => state.selectResult),
		insert: () => ({
			values: (v: Record<string, unknown>) => {
				if (state.insertShouldThrow) throw new Error('boom');
				state.inserted.push(v);
				return { returning: async () => [v] };
			}
		})
	};

	const eventRef = { current: null as unknown };
	return { state, fakeDb, eventRef };
});

vi.mock('$lib/server/database/drizzle', () => ({ default: fakeDb }));
vi.mock('$lib/server/logger', () => ({
	logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), event: vi.fn() }
}));
vi.mock('$app/server', () => ({
	getRequestEvent: () => {
		if (!eventRef.current) throw new Error('no request');
		return eventRef.current;
	}
}));

import { recordAction, recordView } from './audit';
import { FORWARDED_CLIENT_IP_HEADER, FORWARDED_CLIENT_UA_HEADER } from '$lib/audit/constants';

// ---- helpers ---------------------------------------------------------------

function makeEvent(opts: {
	path: string;
	headers?: Record<string, string>;
	user?: Record<string, unknown> | null;
	session?: Record<string, unknown> | null;
	clientAddress?: string;
	isDataRequest?: boolean;
}) {
	return {
		url: new URL(`https://admin.example.com${opts.path}`),
		request: new Request(`https://admin.example.com${opts.path}`, {
			headers: { 'user-agent': 'TestBrowser/1.0', ...(opts.headers ?? {}) }
		}),
		locals: { user: opts.user ?? null, session: opts.session ?? null },
		getClientAddress: () => {
			if (!opts.clientAddress) throw new Error('no address');
			return opts.clientAddress;
		},
		isDataRequest: opts.isDataRequest ?? false
	};
}

const clientUser = {
	id: 'user-1',
	role: 'CLIENT',
	firstName: 'Pat',
	lastName: 'Practice',
	email: 'pat@practice.test'
};

beforeEach(() => {
	state.selectResult = [];
	state.inserted = [];
	state.insertShouldThrow = false;
	eventRef.current = null;
});

// ---- tests -----------------------------------------------------------------

describe('recordAction — source resolution', () => {
	it.each([
		['/invoices/abc?/voidInvoice', 'ADMIN_APP'],
		['/api/external/timesheets/getTimesheetDetails/x', 'CANDIDATE_APP'],
		['/api/jobs/timesheets/processTimesheetAutoApproval', 'CRON'],
		['/api/webhooks/stripe', 'STRIPE']
	])('%s → %s', async (path, source) => {
		eventRef.current = makeEvent({ path, user: clientUser });
		await recordAction({ entityType: 'INVOICES', entityId: 'inv-1', action: 'VIEW' });
		expect(state.inserted[0]).toMatchObject({ source, requestPath: path });
	});

	it('is SYSTEM outside a request and still writes', async () => {
		await recordAction({
			entityType: 'INVOICES',
			entityId: 'inv-1',
			action: 'UPDATE',
			actor: null
		});
		expect(state.inserted[0]).toMatchObject({
			source: 'SYSTEM',
			requestPath: null,
			userId: null,
			ipAddress: null
		});
	});

	it('an explicit source override wins over the path', async () => {
		eventRef.current = makeEvent({ path: '/anything' });
		await recordAction({
			entityType: 'INVOICES',
			entityId: 'inv-1',
			action: 'VOID',
			actor: null,
			source: 'STRIPE'
		});
		expect(state.inserted[0].source).toBe('STRIPE');
	});
});

describe('recordAction — actor resolution', () => {
	it('defaults to locals.user with a role + snapshot', async () => {
		eventRef.current = makeEvent({ path: '/invoices/x', user: clientUser });
		await recordAction({ entityType: 'INVOICES', entityId: 'inv-1', action: 'DOWNLOAD' });
		expect(state.inserted[0]).toMatchObject({
			userId: 'user-1',
			actorRole: 'CLIENT',
			actorSnapshot: { firstName: 'Pat', lastName: 'Practice', email: 'pat@practice.test' }
		});
	});

	it('uses an explicit actor object as-is (JWT endpoints)', async () => {
		eventRef.current = makeEvent({ path: '/api/external/x' });
		await recordAction({
			entityType: 'TIMESHEETS',
			entityId: 't-1',
			action: 'SUBMIT',
			actor: { id: 'cand-1', role: 'CANDIDATE', firstName: 'Dee', lastName: 'Hygienist' }
		});
		expect(state.inserted[0]).toMatchObject({ userId: 'cand-1', actorRole: 'CANDIDATE' });
		expect(state.selectResult).toEqual([]); // no lookup needed
	});

	it('looks a bare user id up when it is not the session user', async () => {
		eventRef.current = makeEvent({ path: '/x', user: clientUser });
		state.selectResult = [{ id: 'user-2', role: 'SUPERADMIN', firstName: 'Al', lastName: 'Admin' }];
		await recordAction({ entityType: 'USERS', entityId: 'u', action: 'SIGN_OUT', actor: 'user-2' });
		expect(state.inserted[0]).toMatchObject({ userId: 'user-2', actorRole: 'SUPERADMIN' });
	});

	it('keeps the id for an already-deleted user', async () => {
		state.selectResult = [];
		await recordAction({ entityType: 'USERS', entityId: 'u', action: 'SIGN_OUT', actor: 'gone' });
		expect(state.inserted[0]).toMatchObject({ userId: 'gone', actorRole: null });
	});

	it('null actor means no actor', async () => {
		eventRef.current = makeEvent({ path: '/x', user: clientUser });
		await recordAction({
			entityType: 'INVOICES',
			entityId: 'i',
			action: 'EMAIL_SENT',
			actor: null
		});
		expect(state.inserted[0].userId).toBeNull();
	});
});

describe('recordAction — request context', () => {
	it('captures first-hop x-forwarded-for, user agent and impersonator', async () => {
		eventRef.current = makeEvent({
			path: '/invoices/x',
			user: clientUser,
			headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' },
			session: { impersonatedBy: 'admin-9' }
		});
		await recordAction({ entityType: 'INVOICES', entityId: 'i', action: 'VIEW' });
		expect(state.inserted[0]).toMatchObject({
			ipAddress: '203.0.113.9',
			userAgent: 'TestBrowser/1.0',
			impersonatedBy: 'admin-9'
		});
	});

	it('falls back to getClientAddress and survives it throwing', async () => {
		eventRef.current = makeEvent({ path: '/x', user: clientUser, clientAddress: '198.51.100.4' });
		await recordAction({ entityType: 'INVOICES', entityId: 'i', action: 'VIEW' });
		expect(state.inserted[0].ipAddress).toBe('198.51.100.4');

		eventRef.current = makeEvent({ path: '/x', user: clientUser });
		await recordAction({ entityType: 'INVOICES', entityId: 'i', action: 'VIEW' });
		expect(state.inserted[1].ipAddress).toBeNull();
	});

	it('prefers the candidate-app forwarded headers on /api/external and keeps the peer ip', async () => {
		eventRef.current = makeEvent({
			path: '/api/external/getWorkdayDetailsForCandidate/w',
			headers: {
				'x-forwarded-for': '10.1.1.1',
				[FORWARDED_CLIENT_IP_HEADER]: '192.0.2.77',
				[FORWARDED_CLIENT_UA_HEADER]: 'Mobile Safari'
			}
		});
		await recordAction({
			entityType: 'RECURRENCE_DAYS',
			entityId: 'r',
			action: 'CLAIM',
			actor: { id: 'cand-1', role: 'CANDIDATE' }
		});
		expect(state.inserted[0]).toMatchObject({
			ipAddress: '192.0.2.77',
			userAgent: 'Mobile Safari',
			metadata: { _proxyIp: '10.1.1.1' }
		});
	});

	it('ignores the forwarded headers off the external path', async () => {
		eventRef.current = makeEvent({
			path: '/invoices/x',
			user: clientUser,
			headers: { 'x-forwarded-for': '10.1.1.1', [FORWARDED_CLIENT_IP_HEADER]: '192.0.2.77' }
		});
		await recordAction({ entityType: 'INVOICES', entityId: 'i', action: 'VIEW' });
		expect(state.inserted[0].ipAddress).toBe('10.1.1.1');
	});

	it('writes through the supplied transaction handle', async () => {
		const txInserts: unknown[] = [];
		const tx = {
			select: fakeDb.select,
			insert: () => ({
				values: (v: unknown) => {
					txInserts.push(v);
					return { returning: async () => [v] };
				}
			})
		};
		await recordAction({ entityType: 'INVOICES', entityId: 'i', action: 'VOID', actor: null, tx });
		expect(txInserts).toHaveLength(1);
		expect(state.inserted).toHaveLength(0);
	});

	it('rethrows when the insert fails', async () => {
		state.insertShouldThrow = true;
		await expect(
			recordAction({ entityType: 'INVOICES', entityId: 'i', action: 'VOID', actor: null })
		).rejects.toThrow('Failed to record action history');
	});
});

describe('recordView', () => {
	it('never logs an anonymous view', async () => {
		eventRef.current = makeEvent({ path: '/invoices/x' });
		await recordView({ entityType: 'INVOICES', entityId: 'i' });
		expect(state.inserted).toHaveLength(0);
	});

	it('inserts a VIEW when there is no recent one', async () => {
		eventRef.current = makeEvent({ path: '/invoices/x', user: clientUser, isDataRequest: true });
		state.selectResult = [];
		await recordView({ entityType: 'INVOICES', entityId: 'i', metadata: { status: 'open' } });
		expect(state.inserted[0]).toMatchObject({
			action: 'VIEW',
			userId: 'user-1',
			metadata: { status: 'open', navigation: 'client' }
		});
	});

	it('skips when the same user viewed the entity inside the throttle window', async () => {
		eventRef.current = makeEvent({ path: '/invoices/x', user: clientUser });
		state.selectResult = [{ id: 'existing-view' }];
		await recordView({ entityType: 'INVOICES', entityId: 'i' });
		expect(state.inserted).toHaveLength(0);
	});

	it('swallows insert failures instead of breaking the page', async () => {
		eventRef.current = makeEvent({ path: '/invoices/x', user: clientUser });
		state.insertShouldThrow = true;
		await expect(recordView({ entityType: 'INVOICES', entityId: 'i' })).resolves.toBeUndefined();
	});
});
