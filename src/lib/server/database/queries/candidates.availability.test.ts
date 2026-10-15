import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Guards ONE product decision: admin and client match lists WARN about a
 * professional's availability, they never hide them.
 *
 * Staffing a shift by picking up the phone has to stay possible, so
 * `getQualifiedProfessionalsForRequisition`'s `dates` option is annotative and the
 * eight-clause PostGIS WHERE is untouched by it. If the length assertion below ever
 * becomes 1, that decision has been lost — which is the kind of regression a
 * refactor makes silently while "tidying up the filters".
 *
 * The one caller that DOES hard-filter is notifyQualifiedCandidatesOfNewWorkdays,
 * which filters the RESULTS, because the blast is the single surface a professional
 * cannot opt out of.
 */

const { state, fakeDb } = vi.hoisted(() => {
	const state = {
		candidateRows: [] as unknown[],
		experienceRows: [{ order: 1 }] as unknown[],
		selectCall: 0
	};

	function chain(resolveTo: () => unknown) {
		const c: Record<string, unknown> = {};
		for (const m of [
			'from',
			'where',
			'limit',
			'orderBy',
			'innerJoin',
			'leftJoin',
			'groupBy'
		])
			c[m] = () => c;
		c.then = (res: (v: unknown) => void, rej: (e: unknown) => void) =>
			Promise.resolve().then(resolveTo).then(res, rej);
		return c;
	}

	const fakeDb = {
		select: (cols: Record<string, unknown>) =>
			chain(() => {
				// The experience-level lookup asks for just { order }; everything else in
				// this function is the candidate query.
				const keys = Object.keys(cols ?? {});
				if (keys.length === 1 && keys[0] === 'order') return state.experienceRows;
				return state.candidateRows;
			}),
		execute: () => Promise.resolve({ rows: [] })
	};

	return { state, fakeDb };
});

vi.mock('$lib/server/database/drizzle', () => ({ default: fakeDb }));
vi.mock('$lib/server/database/queries/config', () => ({
	getDefaultSearchRadius: () => Promise.resolve({ miles: 60, meters: 96560.4 })
}));

// The bulk availability read is the only thing `dates` changes, so it is the seam.
const unavailabilityResult = {
	current: new Map<string, Array<{ date: string; reason: string }>>()
};
vi.mock('$lib/server/availability/queries', () => ({
	getUnavailabilityForCandidates: vi.fn(() => Promise.resolve(unavailabilityResult.current))
}));

const { getQualifiedProfessionalsForRequisition, searchProfessionalsForRequisition } =
	await import('./candidates');
const { getUnavailabilityForCandidates } = await import('$lib/server/availability/queries');

const requisition = {
	disciplineId: 'rdh',
	experienceLevelId: null,
	hourlyRate: 50,
	companyId: 'co-1'
};
// Strings, not numbers: lat/lon are `decimal` columns, so node-postgres hands them
// back as strings and that is what both query functions actually receive.
const location = { lat: '40.7', lon: '-74' };

beforeEach(() => {
	state.selectCall = 0;
	state.experienceRows = [{ order: 1 }];
	state.candidateRows = [
		{ candidateId: 'free', firstName: 'Ada', distance: '3.2' },
		{ candidateId: 'blocked', firstName: 'Grace', distance: '5.5' }
	];
	unavailabilityResult.current = new Map();
	vi.mocked(getUnavailabilityForCandidates).mockClear();
});

describe('getQualifiedProfessionalsForRequisition — warn, never hide', () => {
	it('returns BOTH professionals when one is fully unavailable', async () => {
		unavailabilityResult.current = new Map([
			['blocked', [{ date: '2026-07-04', reason: 'blackout' }]]
		]);

		const result = await getQualifiedProfessionalsForRequisition(requisition, location, {
			dates: ['2026-07-04']
		});

		// THE assertion. A length of 1 here means warn-don't-hide is gone.
		expect(result).toHaveLength(2);
		expect(result.map((r) => r.candidateId)).toEqual(['free', 'blocked']);
	});

	it('flags the unavailable one with its per-date reasons', async () => {
		unavailabilityResult.current = new Map([
			[
				'blocked',
				[
					{ date: '2026-07-04', reason: 'blackout' },
					{ date: '2026-07-05', reason: 'weekday' }
				]
			]
		]);

		const result = await getQualifiedProfessionalsForRequisition(requisition, location, {
			dates: ['2026-07-04', '2026-07-05']
		});

		const free = result.find((r) => r.candidateId === 'free');
		const blocked = result.find((r) => r.candidateId === 'blocked');

		expect(free?.isUnavailable).toBe(false);
		expect(free?.unavailableDates).toEqual([]);
		expect(blocked?.isUnavailable).toBe(true);
		expect(blocked?.unavailableDates).toEqual([
			{ date: '2026-07-04', reason: 'blackout' },
			{ date: '2026-07-05', reason: 'weekday' }
		]);
	});

	it('costs nothing and annotates nothing when `dates` is omitted', async () => {
		// Keeps the existing callers behaviourally identical until each is updated.
		const result = await getQualifiedProfessionalsForRequisition(requisition, location);

		expect(result).toHaveLength(2);
		expect(result.every((r) => r.isUnavailable === false)).toBe(true);
		expect(result.every((r) => Array.isArray(r.unavailableDates) && !r.unavailableDates.length)).toBe(
			true
		);
		expect(getUnavailabilityForCandidates).not.toHaveBeenCalled();
	});

	it('does not issue the availability query for an empty `dates` array', async () => {
		await getQualifiedProfessionalsForRequisition(requisition, location, { dates: [] });
		expect(getUnavailabilityForCandidates).not.toHaveBeenCalled();
	});

	it('still returns everyone when every professional is unavailable', async () => {
		unavailabilityResult.current = new Map([
			['free', [{ date: '2026-07-04', reason: 'weekday' }]],
			['blocked', [{ date: '2026-07-04', reason: 'blackout' }]]
		]);

		const result = await getQualifiedProfessionalsForRequisition(requisition, location, {
			dates: ['2026-07-04']
		});

		expect(result).toHaveLength(2);
		expect(result.every((r) => r.isUnavailable)).toBe(true);
	});
});

describe('searchProfessionalsForRequisition — warn, never hide', () => {
	// This is the "assign anyone by name" override, which DELIBERATELY drops the
	// discipline, experience, pay-range and radius gates. Hiding someone here for
	// being unavailable would defeat the entire purpose of the override.
	const searchOpts = { search: 'ada', limit: 25 };

	beforeEach(() => {
		state.candidateRows = [
			{ candidateId: 'free', firstName: 'Ada', lastName: 'L', disciplines: [], distance: '3.2' },
			{
				candidateId: 'blocked',
				firstName: 'Grace',
				lastName: 'H',
				disciplines: [],
				distance: '5.5'
			}
		];
	});

	it('returns BOTH professionals when one is unavailable', async () => {
		unavailabilityResult.current = new Map([
			['blocked', [{ date: '2026-07-04', reason: 'blackout' }]]
		]);

		const result = await searchProfessionalsForRequisition(requisition, location, {
			...searchOpts,
			dates: ['2026-07-04']
		});

		expect(result).toHaveLength(2);
		expect(result.find((r) => r.candidateId === 'blocked')?.isUnavailable).toBe(true);
		expect(result.find((r) => r.candidateId === 'free')?.isUnavailable).toBe(false);
	});

	it('annotates nothing and runs no extra query without `dates`', async () => {
		const result = await searchProfessionalsForRequisition(requisition, location, searchOpts);

		expect(result).toHaveLength(2);
		expect(result.every((r) => r.isUnavailable === false)).toBe(true);
		expect(getUnavailabilityForCandidates).not.toHaveBeenCalled();
	});

	it('still short-circuits a too-short search term before any query', async () => {
		// The 2-character floor predates this change and must survive it.
		const result = await searchProfessionalsForRequisition(requisition, location, {
			search: 'a',
			dates: ['2026-07-04']
		});
		expect(result).toEqual([]);
		expect(getUnavailabilityForCandidates).not.toHaveBeenCalled();
	});
});
