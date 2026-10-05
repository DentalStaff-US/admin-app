import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * The CDE writers had no tests at all, which is how three divergent implementations
 * survived. These assert the properties that matter for phase 2: the statement shape
 * is an upsert (not delete-all), and the certification columns are untouchable from
 * this path.
 */

const { state, fakeDb } = vi.hoisted(() => {
	const state = {
		selectResult: [] as unknown[],
		deletes: [] as unknown[],
		inserts: [] as Array<{ values: unknown; conflict: unknown }>
	};

	function chain(resolveTo: () => unknown) {
		const c: Record<string, unknown> = {};
		for (const m of ['select', 'from', 'where', 'limit', 'orderBy']) c[m] = () => c;
		c.then = (res: (v: unknown) => void, rej: (e: unknown) => void) =>
			Promise.resolve().then(resolveTo).then(res, rej);
		return c;
	}

	const fakeDb = {
		select: () => chain(() => state.selectResult),
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
		})
	};

	return { state, fakeDb };
});

vi.mock('$lib/server/database/drizzle', () => ({ default: fakeDb }));

const { replaceCandidateDisciplines } = await import('./candidateDisciplines');

const CAND = 'cand-1';
const row = (disciplineId: string, over: Record<string, unknown> = {}) => ({
	disciplineId,
	experienceLevelId: 'lvl-1',
	preferredHourlyMin: 40,
	preferredHourlyMax: 60,
	...over
});

beforeEach(() => {
	state.selectResult = [];
	state.deletes = [];
	state.inserts = [];
});

describe('replaceCandidateDisciplines', () => {
	it('upserts rather than deleting and re-inserting everything', async () => {
		await replaceCandidateDisciplines(CAND, [row('rdh'), row('da')]);

		// Exactly one delete (the dropped-rows cleanup) and one insert statement.
		expect(state.deletes).toHaveLength(1);
		expect(state.inserts).toHaveLength(1);
		expect(state.inserts[0].conflict).toHaveProperty('target');
	});

	it('never writes the certification columns', async () => {
		// The core guarantee of phase 2: a rate edit cannot clear a certification,
		// because this writer has no way to express one. If someone adds
		// requires_cert / cert_expires_on to `values` or `set`, this fails.
		await replaceCandidateDisciplines(CAND, [row('rdh')]);

		const { values, conflict } = state.inserts[0];
		const inserted = (values as Record<string, unknown>[])[0];
		const updated = (conflict as { set: Record<string, unknown> }).set;

		for (const forbidden of ['requiresCert', 'certExpiresOn', 'requires_cert', 'cert_expires_on']) {
			expect(Object.keys(inserted)).not.toContain(forbidden);
			expect(Object.keys(updated)).not.toContain(forbidden);
		}
	});

	it('does not write createdAt, so it survives an update', async () => {
		// The old delete-all reset "how long has this professional held RDH" on every
		// save. defaultNow() owns it on insert; an update must not touch it.
		await replaceCandidateDisciplines(CAND, [row('rdh')]);

		const inserted = (state.inserts[0].values as Record<string, unknown>[])[0];
		expect(Object.keys(inserted)).not.toContain('createdAt');
		expect(
			Object.keys((state.inserts[0].conflict as { set: Record<string, unknown> }).set)
		).not.toContain('createdAt');
	});

	it('updates exactly the three experience columns on conflict', async () => {
		await replaceCandidateDisciplines(CAND, [row('rdh')]);
		const set = (state.inserts[0].conflict as { set: Record<string, unknown> }).set;
		expect(Object.keys(set).sort()).toEqual([
			'experienceLevelId',
			'preferredHourlyMax',
			'preferredHourlyMin',
			'updatedAt'
		]);
	});

	it('still issues the cleanup delete when the payload is empty, but no insert', async () => {
		// notInArray(x, []) renders as `true` in drizzle, so this deletes everything —
		// the correct semantic for "holds nothing", and why every caller's schema
		// carries .min(1) so it is only reachable deliberately.
		await replaceCandidateDisciplines(CAND, []);
		expect(state.deletes).toHaveLength(1);
		expect(state.inserts).toHaveLength(0);
	});

	it('passes every payload row through to one statement', async () => {
		await replaceCandidateDisciplines(CAND, [row('rdh'), row('da'), row('dds')]);
		const values = state.inserts[0].values as Record<string, unknown>[];
		expect(values).toHaveLength(3);
		expect(values.map((v) => v.disciplineId)).toEqual(['rdh', 'da', 'dds']);
		expect(values.every((v) => v.candidateId === CAND)).toBe(true);
	});
});
