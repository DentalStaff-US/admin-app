/**
 * Location scope (10 §4.2), the pure half. `server/scope.ts` reads the user's
 * company, staff role and assignments; this decides capabilities and narrowing.
 */
import type { DashboardCapabilities, DashboardScope, ScopeLocation } from './types';

export type StaffRole = 'CLIENT_ADMIN' | 'CLIENT_MANAGER' | 'CLIENT_EMPLOYEE';

const ALL: DashboardCapabilities = {
	approveTimesheets: true,
	postRequests: true,
	viewBilling: true,
	manageStaff: true
};

const NONE: DashboardCapabilities = {
	approveTimesheets: false,
	postRequests: false,
	viewBilling: false,
	manageStaff: false
};

/**
 * Interim mapping until the product decides (10 §4.2 rule 4, deferred):
 * owner and CLIENT_ADMIN → all; CLIENT_MANAGER → approve + post; CLIENT_EMPLOYEE → view only.
 */
export function capabilitiesFor(role: string, staffRole?: StaffRole | null): DashboardCapabilities {
	if (role === 'SUPERADMIN' || role === 'CLIENT') return { ...ALL };
	if (role !== 'CLIENT_STAFF') return { ...NONE };
	switch (staffRole) {
		case 'CLIENT_ADMIN':
			return { ...ALL };
		case 'CLIENT_MANAGER':
			return { ...NONE, approveTimesheets: true, postRequests: true };
		default:
			return { ...NONE };
	}
}

/** "Tampa, Brandon", "3 locations", "All locations". */
export function scopeLabel(kind: DashboardScope['kind'], locations: ScopeLocation[]): string {
	if (kind !== 'locations') return 'All locations';
	if (locations.length === 0) return 'No locations';
	if (locations.length <= 2) return locations.map((l) => l.name).join(', ');
	return `${locations.length} locations`;
}

/**
 * Narrow a practice scope to one location the user picked (the owner's filter).
 * The pick must already be inside the scope, so it can only narrow, never widen.
 */
export function narrowToLocation(scope: DashboardScope, locationId: string | null | undefined): DashboardScope {
	if (!locationId || scope.kind === 'all') return scope;
	const allowed = scope.locationIds === null ? scope.availableLocations : scope.locations;
	const pick = allowed.find((l) => l.id === locationId);
	if (!pick) return scope;
	return {
		...scope,
		kind: 'locations',
		locationIds: [pick.id],
		locations: [pick],
		chosen: true,
		label: pick.name
	};
}

/** Location names in rows only when the scope covers more than one (10 §4.2 rule 5). */
export function showLocationColumn(scope: Pick<DashboardScope, 'kind' | 'locations' | 'availableLocations'>): boolean {
	if (scope.kind === 'all') return true;
	const covered = scope.kind === 'locations' ? scope.locations : scope.availableLocations;
	return covered.length !== 1;
}

/** A scoped user with no assignments sees one empty state, not zeros (10 §4.2 rule 6). */
export function hasNoLocations(scope: Pick<DashboardScope, 'locationIds'>): boolean {
	return Array.isArray(scope.locationIds) && scope.locationIds.length === 0;
}

/** The chip's InfoHint text. */
export function scopeHint(scope: DashboardScope): string {
	if (scope.kind === 'company') return "You're seeing every location in your practice.";
	if (scope.chosen) return `You're seeing ${scope.label} only. Choose "All locations" to see everything.`;
	const names = scope.locations.map((l) => l.name);
	const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
	return `You're seeing ${list}, the ${names.length === 1 ? 'location' : 'locations'} you're assigned to.`;
}

export type ApprovalTarget = { clientId: string; locationId: string | null; status: string };

/** May this scope approve this timesheet inline? PENDING only, in scope, with the capability. */
export function canApproveInline(scope: DashboardScope, target: ApprovalTarget): boolean {
	if (!scope.can.approveTimesheets) return false;
	if (target.status !== 'PENDING') return false;
	if (scope.kind === 'all') return true;
	if (target.clientId !== scope.clientId) return false;
	if (Array.isArray(scope.locationIds)) {
		return !!target.locationId && scope.locationIds.includes(target.locationId);
	}
	return true;
}
