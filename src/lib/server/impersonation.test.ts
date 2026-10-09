import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Impersonation is the most privileged action in the app, and it is now reachable
 * from three places (the admin users table, the professional header, the client
 * header). These tests pin the authorization gate and — just as importantly — the
 * same-app/cross-app routing, because sending a CANDIDATE down the same-app path
 * would destroy the acting admin's own session on this domain for a session the
 * app immediately bounces.
 */

const { state, fakeDb } = vi.hoisted(() => {
	const state = {
		userRows: [] as unknown[],
		createdSessions: [] as unknown[],
		verificationValues: [] as unknown[],
		impersonateUserCalls: [] as unknown[]
	};

	function chain(resolveTo: () => unknown) {
		const c: Record<string, unknown> = {};
		for (const m of ['from', 'where', 'limit']) c[m] = () => c;
		c.then = (res: (v: unknown) => void, rej: (e: unknown) => void) =>
			Promise.resolve().then(resolveTo).then(res, rej);
		return c;
	}

	const fakeDb = { select: () => chain(() => state.userRows) };
	return { state, fakeDb };
});

vi.mock('$lib/server/database/drizzle', () => ({ default: fakeDb }));
vi.mock('$lib/server/logger', () => ({ logger: { error: () => {}, info: () => {} } }));
vi.mock('$env/dynamic/private', () => ({
	env: { CANDIDATE_APP_DOMAIN: 'https://candidates.example.test' }
}));
vi.mock('$lib/server/auth', () => ({
	auth: {
		api: {
			impersonateUser: (args: unknown) => {
				state.impersonateUserCalls.push(args);
				return Promise.resolve({});
			}
		},
		$context: Promise.resolve({
			internalAdapter: {
				createSession: (userId: string, _dontRemember: boolean, extra: unknown) => {
					state.createdSessions.push({ userId, extra });
					return Promise.resolve({ id: 'sess-1', token: 'sess-token-1', userId });
				},
				createVerificationValue: (v: unknown) => {
					state.verificationValues.push(v);
					return Promise.resolve(v);
				}
			}
		})
	}
}));

const { startImpersonation } = await import('./impersonation');

const ADMIN = { id: 'admin-1', role: 'SUPERADMIN' };

function evt(user: unknown = ADMIN) {
	return {
		locals: { user },
		request: { headers: new Headers() }
	} as never;
}

beforeEach(() => {
	state.userRows = [];
	state.createdSessions = [];
	state.verificationValues = [];
	state.impersonateUserCalls = [];
});

describe('startImpersonation — authorization', () => {
	it('refuses an unauthenticated caller', async () => {
		const result = await startImpersonation(evt(null), 'u-1');
		expect(result).toMatchObject({ ok: false, status: 401 });
	});

	it.each([['CLIENT'], ['CLIENT_STAFF'], ['CANDIDATE']])(
		'refuses a %s caller, even though the route sits under (protected)/admin',
		async (role) => {
			const result = await startImpersonation(evt({ id: 'u-9', role }), 'u-1');
			expect(result).toMatchObject({ ok: false, status: 403 });
			// Nothing may be minted on a rejected call.
			expect(state.createdSessions).toHaveLength(0);
			expect(state.impersonateUserCalls).toHaveLength(0);
		}
	);

	it('refuses impersonating yourself', async () => {
		const result = await startImpersonation(evt(), ADMIN.id);
		expect(result).toMatchObject({ ok: false, status: 400 });
	});

	it('refuses another SUPERADMIN', async () => {
		// Otherwise one admin could act as another with only the first admin's name
		// on the ledger rows.
		state.userRows = [{ id: 'admin-2', role: 'SUPERADMIN', email: 'b@x.test' }];
		const result = await startImpersonation(evt(), 'admin-2');
		expect(result).toMatchObject({ ok: false, status: 403 });
		expect(state.impersonateUserCalls).toHaveLength(0);
	});

	it('refuses a missing id', async () => {
		expect(await startImpersonation(evt(), null)).toMatchObject({ ok: false, status: 400 });
		expect(await startImpersonation(evt(), '   ')).toMatchObject({ ok: false, status: 400 });
	});

	it('refuses an unknown user', async () => {
		state.userRows = [];
		expect(await startImpersonation(evt(), 'nope')).toMatchObject({ ok: false, status: 404 });
	});
});

describe('startImpersonation — same-app path (CLIENT / CLIENT_STAFF)', () => {
	it.each([['CLIENT'], ['CLIENT_STAFF']])('swaps the session cookie for a %s', async (role) => {
		state.userRows = [{ id: 'u-1', role, email: 'c@x.test' }];

		const result = await startImpersonation(evt(), 'u-1');

		expect(result).toMatchObject({ ok: true, mode: 'same-app', redirectTo: '/dashboard' });
		// Better Auth's own endpoint is what sets the cookie.
		expect(state.impersonateUserCalls).toHaveLength(1);
		// No cross-app handoff artifacts.
		expect(state.verificationValues).toHaveLength(0);
	});

	it('honours an explicit redirectTo', async () => {
		state.userRows = [{ id: 'u-1', role: 'CLIENT', email: 'c@x.test' }];
		const result = await startImpersonation(evt(), 'u-1', { redirectTo: '/timesheets' });
		expect(result).toMatchObject({ mode: 'same-app', redirectTo: '/timesheets' });
	});
});

describe('startImpersonation — cross-app path (CANDIDATE)', () => {
	beforeEach(() => {
		state.userRows = [{ id: 'cand-1', role: 'CANDIDATE', email: 'p@x.test' }];
	});

	it('mints a handoff URL on the candidate domain', async () => {
		const result = await startImpersonation(evt(), 'cand-1');

		expect(result).toMatchObject({ ok: true, mode: 'handoff' });
		if (result.ok && result.mode === 'handoff') {
			expect(result.handoffUrl).toMatch(
				/^https:\/\/candidates\.example\.test\/auth\/impersonate\?token=/
			);
		}
	});

	it('NEVER calls impersonateUser, so the admin keeps their session here', async () => {
		// THE assertion for this path. Calling it would swap this domain's cookie to a
		// CANDIDATE session, which hooks.server.ts then bounces to the candidate app —
		// logging the admin out of the admin app for nothing.
		await startImpersonation(evt(), 'cand-1');
		expect(state.impersonateUserCalls).toHaveLength(0);
	});

	it('records the acting admin on the session it creates', async () => {
		// This is what makes the ledger's IMPERSONATE_START row and every subsequent
		// action_history.impersonated_by attributable.
		await startImpersonation(evt(), 'cand-1');
		expect(state.createdSessions).toHaveLength(1);
		expect(state.createdSessions[0]).toMatchObject({
			userId: 'cand-1',
			extra: { impersonatedBy: ADMIN.id }
		});
	});

	it('binds a single-use token to that session with a short TTL', async () => {
		const before = Date.now();
		await startImpersonation(evt(), 'cand-1');

		expect(state.verificationValues).toHaveLength(1);
		const v = state.verificationValues[0] as {
			identifier: string;
			value: string;
			expiresAt: Date;
		};
		// The identifier shape is the one-time-token plugin's, which is what the
		// candidate app's verifyOneTimeToken looks for.
		expect(v.identifier).toMatch(/^one-time-token:/);
		expect(v.value).toBe('sess-token-1');
		const ttl = v.expiresAt.getTime() - before;
		expect(ttl).toBeGreaterThan(0);
		expect(ttl).toBeLessThanOrEqual(3 * 60 * 1000 + 50);
	});
});

describe('startImpersonation — the role is resolved, never trusted', () => {
	it('routes by the DATABASE role, so a forged role cannot pick the path', async () => {
		// The previous inline version read `role` off the posted form. A forged
		// 'CLIENT' for a candidate user would have taken the same-app branch.
		// startImpersonation takes only an id, so there is nothing to forge.
		state.userRows = [{ id: 'cand-1', role: 'CANDIDATE', email: 'p@x.test' }];
		const result = await startImpersonation(evt(), 'cand-1');
		expect(result).toMatchObject({ mode: 'handoff' });
		expect(state.impersonateUserCalls).toHaveLength(0);
	});
});
