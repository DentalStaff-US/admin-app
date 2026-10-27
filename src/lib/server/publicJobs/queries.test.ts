import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

/**
 * The publishable predicate is the whole security model of the public board —
 * if it loses a term, closed or inactive-client postings go public. These tests
 * render it to SQL and assert each term is present, validate the filter schema,
 * and drive listPublicJobs/resolvePublicJob through a chainable fake db.
 */

const { state, fakeDb } = vi.hoisted(() => {
	const state = {
		// Each awaited select chain pops the next result off this queue.
		results: [] as unknown[][],
		calls: [] as Array<{ method: string; args: unknown[] }>
	};

	function chain() {
		const c: Record<string, unknown> = {};
		for (const m of [
			'select',
			'from',
			'innerJoin',
			'leftJoin',
			'where',
			'groupBy',
			'orderBy',
			'limit',
			'offset'
		]) {
			c[m] = (...args: unknown[]) => {
				state.calls.push({ method: m, args });
				return c;
			};
		}
		c.then = (res: (v: unknown) => void, rej: (e: unknown) => void) =>
			Promise.resolve()
				.then(() => state.results.shift() ?? [])
				.then(res, rej);
		return c;
	}

	const fakeDb = {
		select: (...args: unknown[]) => {
			state.calls.push({ method: 'select', args });
			return chain();
		}
	};
	return { state, fakeDb };
});

vi.mock('$lib/server/database/drizzle', () => ({ default: fakeDb }));
vi.mock('$lib/server/skills/requisitionSkills', () => ({
	getSkillRequirementsForDisplay: async (ids: number[]) => new Map(ids.map((id) => [id, []]))
}));

const {
	buildFilterConditions,
	filtersSchema,
	isPublicId,
	listPublicJobs,
	parseFilters,
	publishableCondition,
	resolvePublicJob
} = await import('./queries');

const dialect = new PgDialect();
const render = (condition: SQL) => dialect.sqlToQuery(condition);

beforeEach(() => {
	state.results = [];
	state.calls = [];
});

describe('publishableCondition', () => {
	const { sql, params } = render(publishableCondition);

	it('requires an OPEN, non-archived requisition', () => {
		expect(sql).toContain('"requisitions"."status" = $');
		expect(params).toContain('OPEN');
		expect(sql).toContain('"requisitions"."archived" = $');
	});

	it('requires the owning business to be ACTIVE', () => {
		expect(sql).toContain('"client_profiles"."client_status" = $');
		expect(params).toContain('ACTIVE');
	});

	it('requires a future, open, unclaimed day for temp postings', () => {
		expect(sql).toContain('"requisitions"."permanent_position" = $');
		expect(sql).toMatch(/EXISTS \(SELECT 1 FROM "recurrence_days"/);
		expect(sql).toContain('"recurrence_days"."archived" = false');
		expect(sql).toContain("NOT IN ('CANCELED', 'UNFULFILLED', 'FILLED')");
		expect(sql).toContain('AT TIME ZONE "requisitions"."reference_timezone"');
		expect(sql).toContain('"workdays"."cancelled_at" IS NULL');
	});
});

describe('filtersSchema', () => {
	it('applies defaults', () => {
		const f = filtersSchema.parse({});
		expect(f).toMatchObject({ radius: 25, sort: 'newest', page: 1, limit: 20 });
	});

	it('clamps radius and limit', () => {
		const f = filtersSchema.parse({ radius: '500', limit: '500' });
		expect(f.radius).toBe(100);
		expect(f.limit).toBe(50);
	});

	it('normalises state and city', () => {
		const f = filtersSchema.parse({ state: 'fl', city: ' Tampa ' });
		expect(f.state).toBe('FL');
		expect(f.city).toBe('tampa');
	});

	it.each([
		[{ state: 'Florida' }],
		[{ type: 'contract' }],
		[{ sort: 'random' }],
		[{ page: '0' }],
		[{ lat: '27.9' }],
		[{ lat: '91', lng: '0' }],
		[{ limit: 'abc' }]
	])('rejects %j', (input) => {
		expect(filtersSchema.safeParse(input).success).toBe(false);
	});

	it('parseFilters treats empty params as absent', () => {
		const parsed = parseFilters(new URLSearchParams('state=&city=&page=2'));
		expect(parsed.success).toBe(true);
		if (parsed.success) {
			expect(parsed.data.state).toBeUndefined();
			expect(parsed.data.page).toBe(2);
		}
	});
});

describe('buildFilterConditions', () => {
	it('always starts with the publishable predicate', () => {
		const conditions = buildFilterConditions(filtersSchema.parse({}));
		expect(conditions).toHaveLength(1);
		expect(conditions[0]).toBe(publishableCondition);
	});

	it('adds a lower(city) term, a state term and a radius term', () => {
		const conditions = buildFilterConditions(
			filtersSchema.parse({ city: 'Tampa', state: 'fl', lat: '27.9', lng: '-82.4', radius: '10' })
		);
		const rendered = conditions.map((c) => render(c));
		const all = rendered.map((r) => r.sql).join(' ');
		const params = rendered.flatMap((r) => r.params);
		expect(all).toContain('lower("company_office_locations"."city") = $');
		expect(params).toContain('tampa');
		expect(params).toContain('FL');
		expect(all).toContain('ST_DWithin');
		expect(params).toContain(10 * 1609.34);
	});

	it('uses a reductive experience-level term', () => {
		const [, term] = buildFilterConditions(filtersSchema.parse({ experienceLevel: 'lvl-3' }));
		const { sql, params } = render(term);
		expect(sql).toContain('"requisitions"."experience_level_id" IS NULL OR');
		expect(sql).toContain('<=');
		expect(params).toContain('lvl-3');
	});
});

describe('isPublicId', () => {
	it('accepts uuids only', () => {
		expect(isPublicId('7d3c0d7e-3b8a-4f3e-9a51-0b4f8c1c2d11')).toBe(true);
		expect(isPublicId('42')).toBe(false);
		expect(isPublicId('')).toBe(false);
		expect(isPublicId(undefined)).toBe(false);
	});
});

const row = (over: Record<string, unknown> = {}) => ({
	requisitionId: 7,
	publicId: '7d3c0d7e-3b8a-4f3e-9a51-0b4f8c1c2d11',
	permanent: false,
	disciplineName: 'Dental Assistant',
	disciplineAbbreviation: 'DA',
	experienceLevel: null,
	city: 'Spokane',
	state: 'WA',
	hourlyRate: 30,
	createdAt: new Date('2026-10-01T00:00:00Z'),
	referenceTimezone: 'America/Los_Angeles',
	jobDescription: 'Busy office.',
	distanceMiles: null,
	companyName: 'Acme Dental',
	companyWebsite: null,
	locationName: 'Acme North',
	locationWebsite: null,
	streetOne: '1 Main St',
	streetTwo: null,
	...over
});

describe('listPublicJobs', () => {
	it('paginates, batches open days and returns masked jobs', async () => {
		state.results = [
			[{ total: 41 }], // count
			[row(), row({ requisitionId: 8, permanent: true, publicId: 'b'.repeat(8) })], // page
			[
				{
					requisitionId: 7,
					date: '2026-11-03',
					dayStart: new Date('2026-11-03T16:00:00Z'),
					dayEnd: new Date('2026-11-04T01:00:00Z')
				}
			] // open days (one batched query)
		];

		const result = await listPublicJobs(filtersSchema.parse({ page: '3', limit: '20' }));

		expect(result.total).toBe(41);
		expect(result.page).toBe(3);
		expect(result.limit).toBe(20);
		expect(result.jobs).toHaveLength(2);
		expect(result.jobs[0].schedule).toEqual({
			permanent: false,
			openDateCount: 1,
			nextDates: [{ date: '2026-11-03', start: '08:00', end: '17:00' }]
		});
		expect(result.jobs[1].schedule).toEqual({ permanent: true });
		expect(JSON.stringify(result)).not.toContain('Acme');
		expect(JSON.stringify(result)).not.toContain('"requisitionId"');

		const limit = state.calls.find((c) => c.method === 'limit');
		const offset = state.calls.find((c) => c.method === 'offset');
		expect(limit?.args).toEqual([20]);
		expect(offset?.args).toEqual([40]);
		// count + page + one open-days batch — no per-row queries.
		expect(state.calls.filter((c) => c.method === 'select')).toHaveLength(3);
	});

	it('skips the open-days query when the page has only perm postings', async () => {
		state.results = [[{ total: 1 }], [row({ permanent: true })]];
		await listPublicJobs(filtersSchema.parse({}));
		expect(state.calls.filter((c) => c.method === 'select')).toHaveLength(2);
	});
});

describe('resolvePublicJob', () => {
	it('returns null for a malformed id without querying', async () => {
		expect(await resolvePublicJob('123')).toBeNull();
		expect(state.calls).toHaveLength(0);
	});

	it('returns null when not found', async () => {
		state.results = [[]];
		expect(await resolvePublicJob('7d3c0d7e-3b8a-4f3e-9a51-0b4f8c1c2d11')).toBeNull();
	});

	it('returns the contract shape and nulls firstOpenDate for perm', async () => {
		state.results = [
			[{ requisitionId: 9, permanent: true, open: false, firstOpenDate: '2026-11-01' }]
		];
		expect(await resolvePublicJob('7d3c0d7e-3b8a-4f3e-9a51-0b4f8c1c2d11')).toEqual({
			requisitionId: 9,
			permanent: true,
			firstOpenDate: null,
			open: false
		});
	});

	it('passes the temp first open date through', async () => {
		state.results = [
			[{ requisitionId: 9, permanent: false, open: true, firstOpenDate: '2026-11-03' }]
		];
		expect(await resolvePublicJob('7d3c0d7e-3b8a-4f3e-9a51-0b4f8c1c2d11')).toEqual({
			requisitionId: 9,
			permanent: false,
			firstOpenDate: '2026-11-03',
			open: true
		});
	});
});
