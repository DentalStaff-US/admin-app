import { describe, expect, it } from 'vitest';
import { groupByCategory } from './skillGroups';

describe('groupByCategory', () => {
	it('lists each category once with its skills, in order', () => {
		const out = groupByCategory([
			{ name: 'Open Dental', categoryName: 'Software' },
			{ name: 'Bonding', categoryName: 'Procedures' },
			{ name: 'Dentrix', categoryName: 'Software' }
		]);
		expect(out.map((g) => [g.name, g.skills.map((s) => s.name)])).toEqual([
			['Procedures', ['Bonding']],
			['Software', ['Dentrix', 'Open Dental']]
		]);
	});
});
