import { describe, expect, it } from 'vitest';
import { ALL_LOCATIONS, groupInvites, resolveInviteLocations } from './inviteLocations';

const owned = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

describe('resolveInviteLocations', () => {
	it('grants every location for ALL, primary first', () => {
		expect(resolveInviteLocations(ALL_LOCATIONS, 'b', owned)).toEqual({ ok: true, locationIds: ['b', 'a', 'c'] });
	});
	it('grants only the chosen ones, once each', () => {
		expect(resolveInviteLocations('["c","a","c"]', 'a', owned)).toEqual({ ok: true, locationIds: ['a', 'c'] });
	});
	it('falls back to the first chosen when the primary is not among them', () => {
		expect(resolveInviteLocations('["c","a"]', 'b', owned)).toEqual({ ok: true, locationIds: ['c', 'a'] });
	});
	it('refuses another practice’s location, an empty choice and junk', () => {
		expect(resolveInviteLocations('["a","zzz"]', 'a', owned).ok).toBe(false);
		for (const bad of ['[]', '', 'nope', null, '{}']) expect(resolveInviteLocations(bad, null, owned).ok).toBe(false);
	});
	it('refuses when the practice has no locations', () => {
		expect(resolveInviteLocations(ALL_LOCATIONS, null, []).ok).toBe(false);
	});
});

describe('groupInvites', () => {
	it('merges an invite’s locations into one row, in order', () => {
		expect(
			groupInvites([
				{ id: '1', locationName: 'Tampa' },
				{ id: '2', locationName: null },
				{ id: '1', locationName: 'Brandon' }
			])
		).toEqual([
			{ id: '1', locationName: 'Tampa, Brandon' },
			{ id: '2', locationName: null }
		]);
	});
});
