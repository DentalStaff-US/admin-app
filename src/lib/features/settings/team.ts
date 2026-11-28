/** Team list filtering for settings › Team (was four TanStack tables, one per tab). */
export type StaffRole = 'CLIENT_ADMIN' | 'CLIENT_MANAGER' | 'CLIENT_EMPLOYEE';

export type StaffMember = {
	profile: { id: string; staffRole: StaffRole | null; createdAt: Date | string; birthday?: string | null };
	user: { firstName: string; lastName: string; email: string; avatarUrl?: string | null };
	locationAssignments?: Array<{ locationId: string; isPrimary: boolean; locationName?: string | null }>;
};

export type StaffFilter = 'all' | 'admin' | 'manager' | 'employee';

export const STAFF_FILTERS: { value: StaffFilter; label: string; role?: StaffRole }[] = [
	{ value: 'all', label: 'Everyone' },
	{ value: 'admin', label: 'Admins', role: 'CLIENT_ADMIN' },
	{ value: 'manager', label: 'Managers', role: 'CLIENT_MANAGER' },
	{ value: 'employee', label: 'Employees', role: 'CLIENT_EMPLOYEE' }
];

const byName = (a: StaffMember, b: StaffMember) =>
	`${a.user.lastName}, ${a.user.firstName}`.toLowerCase().localeCompare(`${b.user.lastName}, ${b.user.firstName}`.toLowerCase());

/** Members in one filter, sorted by last name. */
export function filterStaff<T extends StaffMember>(staff: T[], filter: StaffFilter): T[] {
	const role = STAFF_FILTERS.find((f) => f.value === filter)?.role;
	return (role ? staff.filter((s) => s.profile.staffRole === role) : [...staff]).sort(byName);
}

export function staffCounts(staff: StaffMember[]): Record<StaffFilter, number> {
	return {
		all: staff.length,
		admin: staff.filter((s) => s.profile.staffRole === 'CLIENT_ADMIN').length,
		manager: staff.filter((s) => s.profile.staffRole === 'CLIENT_MANAGER').length,
		employee: staff.filter((s) => s.profile.staffRole === 'CLIENT_EMPLOYEE').length
	};
}
