import { describe, expect, it } from 'vitest';
import {
	activityTone,
	clampPage,
	credentialTone,
	displayName,
	initialsOf,
	joinAddress,
	ledgerToTimeline,
	pageSlice,
	profileStatusLabel,
	readOptionalSort,
	readTab,
	sortRows,
	staffRoleLabel,
	statusChangeCopy,
	workPreferenceLabel
} from './people';

describe('names', () => {
	it('builds initials and tolerates blanks', () => {
		expect(initialsOf('maria', 'gonzalez')).toBe('MG');
		expect(initialsOf(' ', null)).toBe('?');
		expect(initialsOf('Cher', undefined)).toBe('C');
	});

	it('joins a display name with a fallback', () => {
		expect(displayName('Maria', 'Gonzalez')).toBe('Maria Gonzalez');
		expect(displayName(null, ' ', 'm@x.com')).toBe('m@x.com');
	});
});

describe('profile status', () => {
	it('labels ACTIVE as Approved and unknowns as Pending', () => {
		expect(profileStatusLabel('ACTIVE')).toBe('Approved');
		expect(profileStatusLabel('DENIED')).toBe('Denied');
		expect(profileStatusLabel(null)).toBe('Pending');
	});

	it('names the object and the consequence', () => {
		const deny = statusChangeCopy('professional', 'Maria Gonzalez', 'DENIED');
		expect(deny.title).toBe('Deny Maria Gonzalez?');
		expect(deny.tone).toBe('destructive');
		expect(deny.description).toMatch(/affiliate/);

		const approveClient = statusChangeCopy('client', 'Bright Smiles', 'ACTIVE');
		expect(approveClient.tone).toBe('success');
		expect(approveClient.description).toMatch(/emailed/);

		expect(statusChangeCopy('client', 'X', 'PENDING').tone).toBe('default');
	});
});

describe('credentialTone', () => {
	it('maps every credential state to a status tone', () => {
		expect(credentialTone('VALID')).toBe('positive');
		expect(credentialTone('EXPIRING')).toBe('warning');
		expect(credentialTone('MISSING_GRACE')).toBe('warning');
		expect(credentialTone('MISSING')).toBe('negative');
		expect(credentialTone('EXPIRED')).toBe('negative');
		expect(credentialTone('NOT_REQUIRED')).toBe('neutral');
	});
});

describe('labels', () => {
	it('defaults the work preference to both', () => {
		expect(workPreferenceLabel(null)).toBe('Both temporary and permanent');
		expect(workPreferenceLabel('TEMP')).toBe('Temporary shifts only');
	});

	it('labels staff roles', () => {
		expect(staffRoleLabel('CLIENT_ADMIN')).toBe('Admin');
		expect(staffRoleLabel(null)).toBe('—');
	});

	it('joins an address skipping blanks', () => {
		expect(joinAddress({ street: '1 Main St', city: 'Tampa', state: 'FL', zip: '33602' })).toBe(
			'1 Main St, Tampa, FL 33602'
		);
		expect(joinAddress({ city: 'Tampa' })).toBe('Tampa');
		expect(joinAddress({})).toBe('');
	});

	it('tones ledger actions', () => {
		expect(activityTone('DELETE')).toBe('negative');
		expect(activityTone('SOMETHING_NEW')).toBe('neutral');
	});

	it('turns ledger rows into timeline entries', () => {
		const [entry, system] = ledgerToTimeline(
			[
				{
					id: 'a',
					createdAt: '2026-11-01T10:00:00Z',
					action: 'UPDATE',
					entityType: 'CANDIDATES',
					actorName: 'Shannon C.',
					metadata: { field: 'disciplines' }
				},
				{ id: 'b', createdAt: '2026-11-02T10:00:00Z', action: 'NEW_THING', entityType: 'X', actorName: null }
			],
			{ action: { UPDATE: 'updated' }, entity: { CANDIDATES: 'professional' } }
		);
		expect(entry).toMatchObject({ actor: 'Shannon C.', text: 'updated this professional (disciplines)', tone: 'info' });
		expect(system).toMatchObject({ actor: 'System', text: 'new thing this x', tone: 'neutral' });
	});
});

describe('sorting and paging', () => {
	type Row = { name: string | null; created: Date; n: number };
	const rows: Row[] = [
		{ name: 'bravo', created: new Date('2026-01-02'), n: 2 },
		{ name: null, created: new Date('2026-01-03'), n: 10 },
		{ name: 'Alpha', created: new Date('2026-01-01'), n: 1 }
	];
	const accessors = { name: (r: Row) => r.name, created: (r: Row) => r.created, n: (r: Row) => r.n };

	it('reads a sort only for allowed columns', () => {
		expect(readOptionalSort(new URL('http://x/?sort=name&dir=asc'), ['name'])).toEqual({
			column: 'name',
			direction: 'asc'
		});
		expect(readOptionalSort(new URL('http://x/?sort=evil'), ['name'])).toBeNull();
		expect(readOptionalSort(new URL('http://x/?sort=name'), ['name'])?.direction).toBe('desc');
	});

	it('keeps the server order without a sort', () => {
		expect(sortRows(rows, null, accessors)).toEqual(rows);
	});

	it('sorts strings case-insensitively with blanks last', () => {
		const asc = sortRows(rows, { column: 'name', direction: 'asc' }, accessors);
		expect(asc.map((r) => r.name)).toEqual(['Alpha', 'bravo', null]);
		const desc = sortRows(rows, { column: 'name', direction: 'desc' }, accessors);
		expect(desc.map((r) => r.name)).toEqual(['bravo', 'Alpha', null]);
	});

	it('sorts numbers numerically and dates chronologically', () => {
		expect(sortRows(rows, { column: 'n', direction: 'asc' }, accessors).map((r) => r.n)).toEqual([
			1, 2, 10
		]);
		expect(
			sortRows(rows, { column: 'created', direction: 'desc' }, accessors).map((r) => r.n)
		).toEqual([10, 2, 1]);
	});

	it('slices and clamps pages', () => {
		const list = Array.from({ length: 25 }, (_, i) => i);
		expect(pageSlice(list, 2, 10)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
		expect(clampPage(9, 25, 10)).toBe(3);
		expect(clampPage(0, 0, 10)).toBe(1);
	});

	it('reads a tab with a fallback', () => {
		expect(readTab('documents', ['overview', 'documents'] as const)).toBe('documents');
		expect(readTab('nope', ['overview', 'documents'] as const)).toBe('overview');
		expect(readTab(null, ['overview'] as const)).toBe('overview');
	});
});

describe('locations list URL contract', () => {
	it('cycles a column asc → desc → default and resets the page', async () => {
		const { locationSortHref, readLocationSort, locationPageHref } = await import('./lists');
		const base = new URL('http://x/locations?skip=20');
		const asc = locationSortHref(base, 'location_name');
		expect(asc).toBe('/locations?sortOn=location_name&sortBy=asc');
		const desc = locationSortHref(new URL(`http://x${asc}`), 'location_name');
		expect(desc).toBe('/locations?sortOn=location_name&sortBy=desc');
		expect(locationSortHref(new URL(`http://x${desc}`), 'location_name')).toBe('/locations');
		expect(readLocationSort(new URL('http://x/?sortOn=a&sortBy=sideways'))).toBeUndefined();
		expect(locationPageHref(new URL('http://x/locations'), 3, 10)).toBe('/locations?skip=20');
		expect(locationPageHref(new URL('http://x/locations?skip=20'), 1, 10)).toBe('/locations');
	});

	it('filters staff by role tab', async () => {
		const { staffForTab } = await import('./lists');
		const rows = [
			{ profile: { staffRole: 'CLIENT_ADMIN' } },
			{ profile: { staffRole: 'CLIENT_EMPLOYEE' } }
		] as any;
		expect(staffForTab(rows, 'all')).toHaveLength(2);
		expect(staffForTab(rows, 'admin')).toHaveLength(1);
		expect(staffForTab(rows, 'manager')).toHaveLength(0);
	});
});
