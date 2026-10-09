import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

/**
 * These assert the statement SHAPES that would be catastrophic to get wrong:
 *   - a weekly pattern of [] must write nothing at all
 *   - the blackout delete must ALWAYS be scoped to the candidate AND both window
 *     bounds, including when the window is being cleared
 *   - past dates are dropped rather than rejected
 *   - the insert is an upsert, so concurrent saves cannot error
 *
 * Same no-database approach as candidateDisciplines.test.ts: a chainable fake with
 * the statements recorded for inspection.
 */

const { state, fakeDb } = vi.hoisted(() => {
	const state = {
		profileRows: [] as unknown[],
		blackoutRows: [] as unknown[],
		bookedRows: [] as unknown[],
		/** Which select() call we're on, so each can resolve differently. */
		selectCall: 0,
		updates: [] as unknown[],
		deletes: [] as unknown[],
		inserts: [] as Array<{ values: unknown; conflict: unknown }>,
		audits: [] as unknown[]
	};

	function chain(resolveTo: () => unknown) {
		const c: Record<string, unknown> = {};
		for (const m of ['from', 'where', 'limit', 'orderBy', 'innerJoin', 'leftJoin']) c[m] = () => c;
		c.then = (res: (v: unknown) => void, rej: (e: unknown) => void) =>
			Promise.resolve().then(resolveTo).then(res, rej);
		return c;
	}

	/**
	 * Resolve each select by the columns it asked for, not by call order — the
	 * functions under test issue these in different orders depending on options.
	 */
	function resolveSelect(cols: Record<string, unknown>) {
		const keys = Object.keys(cols ?? {});
		if (keys.includes('availableDays')) return state.profileRows;
		if (keys.includes('note') || keys.includes('source')) return state.blackoutRows;
		if (keys.includes('workdayId') || keys.includes('requisitionId')) return state.bookedRows;
		// The plain { date } select inside replaceCandidateBlackoutWindow is the
		// existing-rows read; the booked read there also selects only { date }, so
		// both are served from blackoutRows then bookedRows in order.
		state.selectCall += 1;
		return state.selectCall === 1 ? state.blackoutRows : state.bookedRows;
	}

	const executor = {
		select: (cols: Record<string, unknown>) => chain(() => resolveSelect(cols)),
		update: () => ({
			set: (v: unknown) => ({
				where: () => {
					state.updates.push(v);
					return Promise.resolve();
				}
			})
		}),
		delete: () => ({
			where: (cond: unknown) => {
				state.deletes.push(cond);
				return Promise.resolve();
			}
		}),
		insert: () => ({
			values: (v: unknown) => ({
				onConflictDoUpdate: (conflict: unknown) => {
					state.inserts.push({ values: v, conflict });
					return Promise.resolve();
				}
			})
		}),
		execute: () => Promise.resolve({ rows: [] })
	};

	const fakeDb = {
		...executor,
		transaction: async (fn: (tx: unknown) => unknown) => fn(executor)
	};

	return { state, fakeDb };
});

vi.mock('$lib/server/database/drizzle', () => ({ default: fakeDb }));
vi.mock('$lib/server/audit/audit', () => ({
	recordAction: (input: unknown) => {
		state.audits.push(input);
		return Promise.resolve({});
	}
}));
vi.mock('$lib/server/logger', () => ({ logger: { error: () => {}, info: () => {} } }));

const {
	setCandidateWeeklyPattern,
	replaceCandidateBlackoutWindow,
	checkCandidateAvailableOnDates,
	saveCandidateAvailability
} = await import('./queries');

const CAND = 'cand-1';
const dialect = new PgDialect();
const renderedDelete = (i = 0) => dialect.sqlToQuery(state.deletes[i] as never);

beforeEach(() => {
	state.profileRows = [{ availableDays: null, availableDaysUpdatedAt: null, availableDaysSource: null }];
	state.blackoutRows = [];
	state.bookedRows = [];
	state.selectCall = 0;
	state.updates = [];
	state.deletes = [];
	state.inserts = [];
	state.audits = [];
});

describe('setCandidateWeeklyPattern', () => {
	it('refuses an empty pattern and writes NOTHING', async () => {
		const result = await setCandidateWeeklyPattern({
			candidateId: CAND,
			availableDays: [],
			source: 'CANDIDATE'
		});
		expect(result).toMatchObject({ ok: false, reason: 'EMPTY_PATTERN' });
		// Zero statements. An empty array reaching the database would be caught by
		// the CHECK constraint, but it must never get that far.
		expect(state.updates).toHaveLength(0);
	});

	it('persists a sorted, deduped pattern', async () => {
		const result = await setCandidateWeeklyPattern({
			candidateId: CAND,
			availableDays: [2, 1, 1],
			source: 'CANDIDATE'
		});
		expect(result).toMatchObject({ ok: true, after: [1, 2] });
		expect(state.updates[0]).toMatchObject({ availableDays: [1, 2] });
	});

	it('persists NULL as an explicit reset to default-available', async () => {
		const result = await setCandidateWeeklyPattern({
			candidateId: CAND,
			availableDays: null,
			source: 'CANDIDATE'
		});
		expect(result).toMatchObject({ ok: true, after: null });
		expect(state.updates[0]).toMatchObject({ availableDays: null });
	});

	it('records which door wrote the value', async () => {
		await setCandidateWeeklyPattern({
			candidateId: CAND,
			availableDays: [1],
			source: 'ADMIN'
		});
		expect(state.updates[0]).toMatchObject({ availableDaysSource: 'ADMIN' });
	});

	it('rejects an out-of-range day without writing', async () => {
		const result = await setCandidateWeeklyPattern({
			candidateId: CAND,
			availableDays: [7],
			source: 'CANDIDATE'
		});
		expect(result).toMatchObject({ ok: false, reason: 'INVALID_DAY' });
		expect(state.updates).toHaveLength(0);
	});

	it('reports NOT_FOUND for an unknown professional', async () => {
		state.profileRows = [];
		const result = await setCandidateWeeklyPattern({
			candidateId: 'nope',
			availableDays: [1],
			source: 'CANDIDATE'
		});
		expect(result).toMatchObject({ ok: false, reason: 'NOT_FOUND' });
		expect(state.updates).toHaveLength(0);
	});
});

describe('replaceCandidateBlackoutWindow', () => {
	const window = { from: '2026-07-01', to: '2026-07-31' };

	it('issues exactly ONE delete, scoped to the candidate AND both bounds', async () => {
		const result = await replaceCandidateBlackoutWindow({
			candidateId: CAND,
			...window,
			dates: ['2026-07-04'],
			source: 'CANDIDATE',
			today: '2026-07-01'
		});
		expect(result.ok).toBe(true);
		expect(state.deletes).toHaveLength(1);
		const { params } = renderedDelete();
		// Never an unscoped delete: wiping a professional's whole calendar is not a
		// state this function may produce.
		expect(params).toContain(CAND);
		expect(params).toContain('2026-07-01');
		expect(params).toContain('2026-07-31');
	});

	it('still issues that scoped delete when the window is being CLEARED', async () => {
		// Clearing a month is legal and must work; what must not happen is an
		// unscoped delete. The notInArray(x, []) class of bug, from the other side.
		const result = await replaceCandidateBlackoutWindow({
			candidateId: CAND,
			...window,
			dates: [],
			source: 'CANDIDATE',
			today: '2026-07-01'
		});
		expect(result.ok).toBe(true);
		expect(state.deletes).toHaveLength(1);
		expect(renderedDelete().params).toContain(CAND);
		// Nothing re-inserted.
		expect(state.inserts).toHaveLength(0);
	});

	it('uses an upsert so concurrent saves cannot error', async () => {
		await replaceCandidateBlackoutWindow({
			candidateId: CAND,
			...window,
			dates: ['2026-07-04'],
			source: 'CANDIDATE',
			today: '2026-07-01'
		});
		expect(state.inserts).toHaveLength(1);
		expect(state.inserts[0].conflict).toHaveProperty('target');
	});

	it('silently drops past dates and reports them', async () => {
		const result = await replaceCandidateBlackoutWindow({
			candidateId: CAND,
			from: '2026-07-01',
			to: '2026-07-31',
			dates: ['2026-07-02', '2026-07-20'],
			source: 'CANDIDATE',
			today: '2026-07-10'
		});
		expect(result).toMatchObject({ ok: true, ignoredPast: ['2026-07-02'] });
		const values = state.inserts[0].values as Array<{ date: string }>;
		expect(values.map((v) => v.date)).toEqual(['2026-07-20']);
	});

	it('lets an admin record a past date when explicitly allowed', async () => {
		const result = await replaceCandidateBlackoutWindow({
			candidateId: CAND,
			from: '2026-07-01',
			to: '2026-07-31',
			dates: ['2026-07-02'],
			source: 'ADMIN',
			today: '2026-07-10',
			allowPastDate: true
		});
		expect(result).toMatchObject({ ok: true, ignoredPast: [] });
		expect((state.inserts[0].values as unknown[]).length).toBe(1);
	});

	it('rejects an inverted window without writing', async () => {
		const result = await replaceCandidateBlackoutWindow({
			candidateId: CAND,
			from: '2026-07-31',
			to: '2026-07-01',
			dates: [],
			source: 'CANDIDATE'
		});
		expect(result).toMatchObject({ ok: false, reason: 'WINDOW' });
		expect(state.deletes).toHaveLength(0);
	});

	it('rejects a date outside the declared window without writing', async () => {
		// A client bug. Accepting it would let a partial view delete rows it never
		// rendered.
		const result = await replaceCandidateBlackoutWindow({
			candidateId: CAND,
			...window,
			dates: ['2026-09-01'],
			source: 'CANDIDATE',
			today: '2026-07-01'
		});
		expect(result).toMatchObject({ ok: false, reason: 'WINDOW' });
		expect(state.deletes).toHaveLength(0);
	});

	it('accepts a date arbitrarily far in the future — there is NO horizon', async () => {
		const result = await replaceCandidateBlackoutWindow({
			candidateId: CAND,
			from: '2031-01-01',
			to: '2031-12-31',
			dates: ['2031-06-15'],
			source: 'CANDIDATE',
			today: '2026-07-01'
		});
		expect(result.ok).toBe(true);
	});

	it('rejects more dates than one request may carry', async () => {
		// Distinct dates, since the set is deduped before the cap is applied.
		const dates = Array.from({ length: 1001 }, (_, i) =>
			new Date(Date.UTC(2027, 0, 1 + i)).toISOString().slice(0, 10)
		);
		const result = await replaceCandidateBlackoutWindow({
			candidateId: CAND,
			from: '2026-01-01',
			to: '2036-01-01',
			dates,
			source: 'CANDIDATE',
			today: '2026-07-01'
		});
		expect(result).toMatchObject({ ok: false, reason: 'TOO_MANY' });
		expect(state.deletes).toHaveLength(0);
	});

	it('refuses to let a PROFESSIONAL black out a day they are booked on', async () => {
		state.blackoutRows = [];
		state.bookedRows = [{ date: '2026-07-20' }];
		const result = await replaceCandidateBlackoutWindow({
			candidateId: CAND,
			...window,
			dates: ['2026-07-20'],
			source: 'CANDIDATE',
			today: '2026-07-01'
		});
		expect(result).toMatchObject({ ok: false, reason: 'BOOKED' });
		expect(state.deletes).toHaveLength(0);
	});

	it('ALLOWS an admin to do it, reporting the conflict', async () => {
		// "She's out sick Thursday" is how a cancellation begins; refusing it would
		// force staff to cancel first and lose the note.
		state.blackoutRows = [];
		state.bookedRows = [{ date: '2026-07-20' }];
		const result = await replaceCandidateBlackoutWindow({
			candidateId: CAND,
			...window,
			dates: ['2026-07-20'],
			source: 'ADMIN',
			today: '2026-07-01'
		});
		expect(result).toMatchObject({ ok: true, conflictsWithBooked: ['2026-07-20'] });
	});
});

describe('checkCandidateAvailableOnDates', () => {
	it('is available for a professional who has set nothing', async () => {
		const result = await checkCandidateAvailableOnDates(CAND, ['2026-07-04']);
		expect(result).toEqual({ available: true, blocked: [] });
	});

	it('short-circuits on an empty date list without querying', async () => {
		const result = await checkCandidateAvailableOnDates(CAND, []);
		expect(result).toEqual({ available: true, blocked: [] });
	});

	it('blocks a date outside the weekly pattern', async () => {
		state.profileRows = [
			{ availableDays: [1, 2, 3, 4, 5], availableDaysUpdatedAt: null, availableDaysSource: 'CANDIDATE' }
		];
		// 2026-07-04 is a Saturday.
		const result = await checkCandidateAvailableOnDates(CAND, ['2026-07-04']);
		expect(result.available).toBe(false);
		expect(result.blocked[0]).toMatchObject({ date: '2026-07-04', reason: 'weekday' });
	});
});

describe('saveCandidateAvailability', () => {
	it('writes exactly one audit row tagged as an availability change', async () => {
		const result = await saveCandidateAvailability({
			candidateId: CAND,
			availableDays: [1, 2, 3, 4, 5],
			blackouts: { from: '2026-07-01', to: '2026-07-31', dates: ['2026-07-04'] },
			source: 'CANDIDATE',
			today: '2026-07-01'
		});
		expect(result.ok).toBe(true);
		expect(state.audits).toHaveLength(1);
		expect(state.audits[0]).toMatchObject({
			entityType: 'CANDIDATES',
			entityId: CAND,
			action: 'UPDATE',
			metadata: { field: 'availability', source: 'CANDIDATE' }
		});
	});

	it('leaves the pattern alone when availableDays is omitted', async () => {
		// The calendar page saves blackouts only; it must not clear the pattern.
		await saveCandidateAvailability({
			candidateId: CAND,
			blackouts: { from: '2026-07-01', to: '2026-07-31', dates: [] },
			source: 'CANDIDATE',
			today: '2026-07-01'
		});
		expect(state.updates).toHaveLength(0);
	});

	it('aborts the whole save when the pattern is empty', async () => {
		const result = await saveCandidateAvailability({
			candidateId: CAND,
			availableDays: [],
			blackouts: { from: '2026-07-01', to: '2026-07-31', dates: ['2026-07-04'] },
			source: 'CANDIDATE',
			today: '2026-07-01'
		});
		expect(result).toMatchObject({ ok: false, reason: 'EMPTY_PATTERN' });
		expect(state.deletes).toHaveLength(0);
		expect(state.inserts).toHaveLength(0);
		expect(state.audits).toHaveLength(0);
	});
});
