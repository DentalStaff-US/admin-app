/**
 * Row shapes and sort accessors for the people lists. The lists load every
 * matching row (no LIMIT, by request), so DataTable's URL sort is applied in
 * the browser with `sortRows` from ./people.
 */
import type { DisciplineSummary } from '$lib/_helpers/professional-filters';
import type { LocationSummary } from '$lib/_helpers/client-filters';

export type ProfessionalRow = {
	user: {
		firstName: string | null;
		lastName: string | null;
		email: string | null;
		avatarUrl: string | null;
	};
	profile: {
		id: string;
		cellPhone: string | null;
		completeAddress: string | null;
		createdAt: Date | string;
	};
	disciplines?: DisciplineSummary[];
};

export const PROFESSIONAL_SORT = {
	name: (r: ProfessionalRow) => `${r.user.lastName ?? ''}, ${r.user.firstName ?? ''}`,
	disciplines: (r: ProfessionalRow) => r.disciplines?.map((d) => d.name).join(', ') ?? '',
	email: (r: ProfessionalRow) => r.user.email,
	cellPhone: (r: ProfessionalRow) => r.profile.cellPhone,
	address: (r: ProfessionalRow) => r.profile.completeAddress,
	createdAt: (r: ProfessionalRow) => new Date(r.profile.createdAt)
};

export type ClientRow = {
	user: { email: string; id: string; firstName: string; lastName: string; avatarUrl: string | null };
	profile: { id: string; userId: string; createdAt: Date | string; status: string | null; cellPhone: string | null };
	company: { id: string; companyName: string; companyLogo: string | null };
	locations: LocationSummary[];
};

export const CLIENT_SORT = {
	companyName: (r: ClientRow) => r.company.companyName,
	name: (r: ClientRow) => `${r.user.lastName ?? ''}, ${r.user.firstName ?? ''}`,
	email: (r: ClientRow) => r.user.email,
	locations: (r: ClientRow) =>
		r.locations?.map((l) => [l.city, l.state].filter(Boolean).join(', ')).join('; ') ?? '',
	createdAt: (r: ClientRow) => new Date(r.profile.createdAt)
};

export type StaffRow = {
	profile: {
		id: string;
		createdAt: Date | string;
		birthday: string | null;
		staffRole: 'CLIENT_ADMIN' | 'CLIENT_MANAGER' | 'CLIENT_EMPLOYEE' | null;
	};
	user: { id: string; firstName: string; lastName: string; email: string; avatarUrl: string | null };
};

export const STAFF_SORT = {
	name: (r: StaffRow) => `${r.user.lastName ?? ''}, ${r.user.firstName ?? ''}`,
	email: (r: StaffRow) => r.user.email,
	role: (r: StaffRow) => r.profile.staffRole,
	createdAt: (r: StaffRow) => new Date(r.profile.createdAt)
};

export const STAFF_TABS = [
	{ value: 'all', label: 'All staff', role: null },
	{ value: 'admin', label: 'Admins', role: 'CLIENT_ADMIN' },
	{ value: 'manager', label: 'Managers', role: 'CLIENT_MANAGER' },
	{ value: 'employee', label: 'Employees', role: 'CLIENT_EMPLOYEE' }
] as const;

export type StaffTab = (typeof STAFF_TABS)[number]['value'];

/** Staff on one role tab ("all" keeps everyone). */
export function staffForTab<T extends StaffRow>(rows: readonly T[], tab: StaffTab): T[] {
	const role = STAFF_TABS.find((t) => t.value === tab)?.role ?? null;
	return role ? rows.filter((r) => r.profile.staffRole === role) : [...rows];
}

/** A raw `client_company_locations` row as the locations list query returns it. */
export type LocationRow = {
	id: string;
	location_name: string;
	complete_address: string | null;
	city?: string | null;
	state?: string | null;
	company_phone?: string | null;
	cell_phone?: string | null;
	email?: string | null;
	website?: string | null;
};

/** `?sortOn=&sortBy=` (the locations list's own URL contract) → a DataTable sort. */
export function readLocationSort(url: URL): { column: string; direction: 'asc' | 'desc' } | undefined {
	const column = url.searchParams.get('sortOn');
	const dir = url.searchParams.get('sortBy');
	return column && (dir === 'asc' || dir === 'desc') ? { column, direction: dir } : undefined;
}

/** Next sort for a column: asc → desc → server default, matching the old header clicks. */
export function locationSortHref(url: URL, column: string): string {
	const next = new URL(url);
	const current = readLocationSort(url);
	next.searchParams.delete('skip');
	if (current?.column !== column) {
		next.searchParams.set('sortOn', column);
		next.searchParams.set('sortBy', 'asc');
	} else if (current.direction === 'asc') {
		next.searchParams.set('sortBy', 'desc');
	} else {
		next.searchParams.delete('sortOn');
		next.searchParams.delete('sortBy');
	}
	return `${next.pathname}${next.search}`;
}

/** Page links for the offset-based (`?skip=`) locations list. */
export function locationPageHref(url: URL, page: number, pageSize: number): string {
	const next = new URL(url);
	if (page <= 1) next.searchParams.delete('skip');
	else next.searchParams.set('skip', String((page - 1) * pageSize));
	return `${next.pathname}${next.search}`;
}
