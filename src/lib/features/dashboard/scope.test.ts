import { describe, expect, it } from 'vitest';
import { canApproveInline, capabilitiesFor, hasNoLocations, narrowToLocation, scopeLabel, showLocationColumn } from './scope';
import type { DashboardScope } from './types';

const TAMPA = { id: 'loc-t', name: 'Tampa' };
const BRANDON = { id: 'loc-b', name: 'Brandon' };
const ORLANDO = { id: 'loc-o', name: 'Orlando' };

const company = (over: Partial<DashboardScope> = {}): DashboardScope => ({
	kind: 'company',
	clientId: 'client-1',
	companyId: 'co-1',
	locationIds: null,
	locations: [TAMPA, BRANDON, ORLANDO],
	availableLocations: [TAMPA, BRANDON, ORLANDO],
	chosen: false,
	label: 'All locations',
	can: capabilitiesFor('CLIENT'),
	ownerName: 'Dana Ruiz',
	ownerEmail: 'dana@example.com',
	...over
});

const manager = (): DashboardScope =>
	company({
		kind: 'locations',
		locationIds: [TAMPA.id],
		locations: [TAMPA],
		availableLocations: [TAMPA],
		label: 'Tampa',
		can: capabilitiesFor('CLIENT_STAFF', 'CLIENT_MANAGER')
	});

describe('capabilitiesFor (interim mapping, 10 §4.2 rule 4)', () => {
	it('gives owners and practice admins everything', () => {
		expect(capabilitiesFor('CLIENT')).toEqual({ approveTimesheets: true, postRequests: true, viewBilling: true, manageStaff: true });
		expect(capabilitiesFor('CLIENT_STAFF', 'CLIENT_ADMIN').viewBilling).toBe(true);
	});
	it('lets managers approve and post, but not see billing or staff', () => {
		expect(capabilitiesFor('CLIENT_STAFF', 'CLIENT_MANAGER')).toEqual({ approveTimesheets: true, postRequests: true, viewBilling: false, manageStaff: false });
	});
	it('makes employees view-only', () => {
		expect(Object.values(capabilitiesFor('CLIENT_STAFF', 'CLIENT_EMPLOYEE')).some(Boolean)).toBe(false);
		expect(Object.values(capabilitiesFor('CANDIDATE')).some(Boolean)).toBe(false);
	});
});

describe('narrowToLocation', () => {
	it('lets an owner pick one of their locations', () => {
		const s = narrowToLocation(company(), BRANDON.id);
		expect(s).toMatchObject({ kind: 'locations', locationIds: [BRANDON.id], chosen: true, label: 'Brandon' });
	});
	it('can never widen a scope', () => {
		expect(narrowToLocation(manager(), BRANDON.id).locationIds).toEqual([TAMPA.id]);
		expect(narrowToLocation(company(), 'someone-elses-location').locationIds).toBeNull();
	});
});

describe('labels and the location column', () => {
	it('labels the scope', () => {
		expect(scopeLabel('company', [])).toBe('All locations');
		expect(scopeLabel('locations', [TAMPA, BRANDON])).toBe('Tampa, Brandon');
		expect(scopeLabel('locations', [TAMPA, BRANDON, ORLANDO])).toBe('3 locations');
	});
	it('shows the location column only when the scope covers more than one', () => {
		expect(showLocationColumn(company())).toBe(true);
		expect(showLocationColumn(manager())).toBe(false);
		expect(showLocationColumn(company({ availableLocations: [TAMPA], locations: [TAMPA] }))).toBe(false);
	});
	it('spots the no-assignment state', () => {
		expect(hasNoLocations({ locationIds: [] })).toBe(true);
		expect(hasNoLocations({ locationIds: null })).toBe(false);
	});
});

describe('canApproveInline', () => {
	const target = { clientId: 'client-1', locationId: TAMPA.id, status: 'PENDING' };
	it('allows an in-scope PENDING timesheet', () => {
		expect(canApproveInline(manager(), target)).toBe(true);
		expect(canApproveInline(company(), { ...target, locationId: ORLANDO.id })).toBe(true);
	});
	it("refuses another practice's or another location's timesheet", () => {
		expect(canApproveInline(company(), { ...target, clientId: 'client-2' })).toBe(false);
		expect(canApproveInline(manager(), { ...target, locationId: BRANDON.id })).toBe(false);
	});
	it('refuses without the capability, or when not PENDING', () => {
		expect(canApproveInline(company({ can: capabilitiesFor('CLIENT_STAFF', 'CLIENT_EMPLOYEE') }), target)).toBe(false);
		expect(canApproveInline(company(), { ...target, status: 'DISCREPANCY' })).toBe(false);
	});
});
