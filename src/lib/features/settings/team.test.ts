import { describe, expect, it } from 'vitest';
import { filterStaff, staffCounts, type StaffMember } from './team';

const member = (first: string, last: string, staffRole: StaffMember['profile']['staffRole']): StaffMember => ({
	profile: { id: `${first}-${last}`, staffRole, createdAt: '2026-01-01' },
	user: { firstName: first, lastName: last, email: `${first}@x.test` }
});

const staff = [
	member('Zoe', 'Adams', 'CLIENT_EMPLOYEE'),
	member('Ann', 'Baker', 'CLIENT_ADMIN'),
	member('Bob', 'adams', 'CLIENT_MANAGER'),
	member('Cy', 'Cole', null)
];

describe('team filters', () => {
	it('sorts by last name, then first, ignoring case', () => {
		expect(filterStaff(staff, 'all').map((m) => m.user.firstName)).toEqual(['Bob', 'Zoe', 'Ann', 'Cy']);
	});

	it('filters by role and counts each tab', () => {
		expect(filterStaff(staff, 'admin').map((m) => m.user.firstName)).toEqual(['Ann']);
		expect(staffCounts(staff)).toEqual({ all: 4, admin: 1, manager: 1, employee: 1 });
	});

	it('does not reorder the input', () => {
		filterStaff(staff, 'all');
		expect(staff[0].user.firstName).toBe('Zoe');
	});
});
