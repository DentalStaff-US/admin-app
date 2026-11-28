import { describe, expect, it } from 'vitest';
import { SETTINGS_MENU_OPTIONS } from '$lib/config/constants';
import { NOTIFICATIONS_HREF, resolveSection, settingsSections, settingsViewFor } from './settingsNav';

const url = (search: string) => new URL(`https://app.test/settings${search}`);

describe('settingsViewFor', () => {
	it('matches the old page branches', () => {
		expect(settingsViewFor('SUPERADMIN', false)).toBe('admin');
		expect(settingsViewFor('CLIENT', false)).toBe('client');
		expect(settingsViewFor('CLIENT_STAFF', true)).toBe('client');
		expect(settingsViewFor('CLIENT_STAFF', false)).toBe('staff');
		expect(settingsViewFor('CANDIDATE', false)).toBeNull();
	});
});

describe('settingsSections', () => {
	it('gives practices every section, notifications included', () => {
		const labels = settingsSections('client').map((s) => s.label);
		expect(labels).toEqual(['Profile', 'Practice', 'Team', 'Billing', 'Documents', 'Password & security', 'Notifications']);
	});

	it('adds the affiliate program only when it is open to the user', () => {
		expect(settingsSections('staff', { affiliate: true }).at(-1)?.label).toBe('Affiliate program');
		expect(settingsSections('staff').some((s) => s.label === 'Affiliate program')).toBe(false);
	});

	it('admins get profile, security and notifications', () => {
		expect(settingsSections('admin').map((s) => s.id)).toEqual([
			SETTINGS_MENU_OPTIONS.ADMIN.PROFILE,
			SETTINGS_MENU_OPTIONS.ADMIN.PASSWORD,
			'NOTIFICATIONS'
		]);
	});

	it('keeps the existing deep-link URL shape', () => {
		const billing = settingsSections('client').find((s) => s.label === 'Billing');
		expect(billing?.href).toBe('/settings?tab=BILLING&role=CLIENT');
		expect(billing?.id).toBe(SETTINGS_MENU_OPTIONS.CLIENT.BILLING);
		expect(settingsSections('client').find((s) => s.route)?.href).toBe(NOTIFICATIONS_HREF);
	});
});

describe('resolveSection', () => {
	it('follows the links in emails and on the requests page', () => {
		expect(resolveSection('client', url('?tab=BILLING&role=CLIENT'))).toEqual({
			id: SETTINGS_MENU_OPTIONS.CLIENT.BILLING,
			explicit: true
		});
		expect(resolveSection('client', url('?tab=DOCUMENTS&role=CLIENT')).id).toBe(SETTINGS_MENU_OPTIONS.CLIENT.DOCUMENTS);
	});

	it('falls back to the first section, not explicit, when the URL names nothing usable', () => {
		const first = { id: SETTINGS_MENU_OPTIONS.CLIENT_STAFF.PROFILE, explicit: false };
		expect(resolveSection('staff', url(''))).toEqual(first);
		// A staff member following a billing link they can't use.
		expect(resolveSection('staff', url('?tab=BILLING&role=CLIENT'))).toEqual(first);
		expect(resolveSection('staff', url('?tab=nope&role=__proto__'))).toEqual(first);
	});
});
