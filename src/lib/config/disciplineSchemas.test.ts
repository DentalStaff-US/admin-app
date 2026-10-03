import { describe, it, expect } from 'vitest';
import { updateCandidateDisciplinesSchema } from './zod-schemas';

const row = (disciplineId: string, over: Record<string, unknown> = {}) => ({
	disciplineId,
	experienceLevelId: 'lvl-1',
	preferredHourlyMin: 40,
	preferredHourlyMax: 60,
	...over
});

describe('updateCandidateDisciplinesSchema', () => {
	it('accepts a normal payload', () => {
		const r = updateCandidateDisciplinesSchema.safeParse({ disciplines: [row('rdh'), row('da')] });
		expect(r.success).toBe(true);
	});

	it('rejects a duplicated discipline', () => {
		// Load-bearing, not hygiene: replaceCandidateDisciplines writes the whole set
		// in one INSERT … ON CONFLICT DO UPDATE, and Postgres raises SQLSTATE 21000
		// on a duplicate key within a single statement. Both UIs guard this only on
		// the client.
		const r = updateCandidateDisciplinesSchema.safeParse({
			disciplines: [row('rdh'), row('da'), row('rdh')]
		});
		expect(r.success).toBe(false);
		if (!r.success) {
			expect(r.error.issues.some((i) => /listed twice/i.test(i.message))).toBe(true);
		}
	});

	it('rejects an empty list', () => {
		// notInArray(x, []) is `true` in drizzle, so an empty payload would delete the
		// professional's entire discipline set.
		expect(updateCandidateDisciplinesSchema.safeParse({ disciplines: [] }).success).toBe(false);
	});

	it('still rejects an inverted pay range', () => {
		const r = updateCandidateDisciplinesSchema.safeParse({
			disciplines: [row('rdh', { preferredHourlyMin: 80, preferredHourlyMax: 50 })]
		});
		expect(r.success).toBe(false);
	});

	it('carries no certification fields', () => {
		// Phase 2 keeps requires_cert / cert_expires_on out of this payload on
		// purpose — superforms materialises zod defaults before an action can tell
		// "omitted" from "sent false", so preserve-on-omit is unimplementable here.
		const parsed = updateCandidateDisciplinesSchema.parse({
			disciplines: [row('rdh', { requiresCert: true, certExpiresOn: '2027-04-30' })]
		});
		expect(parsed.disciplines[0]).not.toHaveProperty('requiresCert');
		expect(parsed.disciplines[0]).not.toHaveProperty('certExpiresOn');
	});
});
