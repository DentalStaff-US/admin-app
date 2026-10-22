import { describe, it, expect } from 'vitest';
import {
	checkSkillRequirements,
	hasSkillRequirements,
	parseSkillRequirementsInput,
	type SkillRequirementCategory
} from './skillRequirements';

const held = (...ids: string[]) => new Set(ids);

const software: SkillRequirementCategory = {
	categoryId: 'cat-software',
	matchMode: 'ANY',
	skillIds: ['dentrix', 'eaglesoft']
};
const clinical: SkillRequirementCategory = {
	categoryId: 'cat-clinical',
	matchMode: 'ALL',
	skillIds: ['srp', 'perio-charting']
};

describe('checkSkillRequirements', () => {
	it('passes when there are no requirements (No Preference everywhere)', () => {
		expect(checkSkillRequirements([], held()).ok).toBe(true);
		expect(checkSkillRequirements(undefined, undefined).ok).toBe(true);
	});

	it('treats an empty category as No Preference', () => {
		const r = checkSkillRequirements([{ ...clinical, skillIds: [] }], held());
		expect(r.ok).toBe(true);
	});

	it('ALL passes only when every chosen skill is held', () => {
		expect(checkSkillRequirements([clinical], held('srp', 'perio-charting', 'x')).ok).toBe(true);
		const partial = checkSkillRequirements([clinical], held('srp'));
		expect(partial).toEqual({
			ok: false,
			missing: [{ categoryId: 'cat-clinical', matchMode: 'ALL', skillIds: ['perio-charting'] }]
		});
	});

	it('ANY passes when at least one chosen skill is held', () => {
		expect(checkSkillRequirements([software], held('eaglesoft')).ok).toBe(true);
		const none = checkSkillRequirements([software], held('open-dental'));
		expect(none).toEqual({
			ok: false,
			missing: [
				{ categoryId: 'cat-software', matchMode: 'ANY', skillIds: ['dentrix', 'eaglesoft'] }
			]
		});
	});

	it('requires every category to pass and reports each failing one', () => {
		expect(
			checkSkillRequirements([software, clinical], held('dentrix', 'srp', 'perio-charting')).ok
		).toBe(true);
		const r = checkSkillRequirements([software, clinical], held('srp'));
		expect(r.ok).toBe(false);
		expect(r.missing.map((m) => m.categoryId)).toEqual(['cat-software', 'cat-clinical']);
	});

	it('treats a missing held set as holding nothing', () => {
		expect(checkSkillRequirements([software], undefined).ok).toBe(false);
	});
});

describe('hasSkillRequirements', () => {
	it('is false for none or only-empty categories', () => {
		expect(hasSkillRequirements([])).toBe(false);
		expect(hasSkillRequirements([{ ...software, skillIds: [] }])).toBe(false);
		expect(hasSkillRequirements([software])).toBe(true);
	});
});

describe('parseSkillRequirementsInput', () => {
	it('returns [] for absent or blank input', () => {
		expect(parseSkillRequirementsInput(null)).toEqual([]);
		expect(parseSkillRequirementsInput('')).toEqual([]);
		expect(parseSkillRequirementsInput('   ')).toEqual([]);
	});

	it('parses, de-duplicates skills, and drops empty categories', () => {
		const raw = JSON.stringify([
			{ categoryId: 'a', matchMode: 'ALL', skillIds: ['x', 'x', 'y'] },
			{ categoryId: 'b', matchMode: 'ANY', skillIds: [] }
		]);
		expect(parseSkillRequirementsInput(raw)).toEqual([
			{ categoryId: 'a', matchMode: 'ALL', skillIds: ['x', 'y'] }
		]);
	});

	it('keeps the last occurrence of a repeated category', () => {
		const raw = JSON.stringify([
			{ categoryId: 'a', matchMode: 'ALL', skillIds: ['x'] },
			{ categoryId: 'a', matchMode: 'ANY', skillIds: ['y'] }
		]);
		expect(parseSkillRequirementsInput(raw)).toEqual([
			{ categoryId: 'a', matchMode: 'ANY', skillIds: ['y'] }
		]);
	});

	it('throws on malformed input instead of silently dropping requirements', () => {
		expect(() => parseSkillRequirementsInput('{nope')).toThrow();
		expect(() =>
			parseSkillRequirementsInput(
				JSON.stringify([{ categoryId: 'a', matchMode: 'SOME', skillIds: [] }])
			)
		).toThrow();
		expect(() => parseSkillRequirementsInput(JSON.stringify({ categoryId: 'a' }))).toThrow();
	});
});
