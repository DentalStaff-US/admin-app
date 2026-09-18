import { describe, it, expect } from 'vitest';
import { pageTitle, pageLabel } from '$lib/pageTitle';

describe('pageTitle', () => {
	it('titles top-level routes', () => {
		expect(pageTitle('/dashboard')).toBe('Dashboard | DTSS');
		expect(pageTitle('/calendar')).toBe('Calendar | DTSS');
	});

	it('covers dynamic segments via prefix', () => {
		expect(pageTitle('/clients/abc-123')).toBe('Clients | DTSS');
		expect(pageTitle('/requisitions/42/workday/7')).toBe('Requisitions | DTSS');
		expect(pageTitle('/support/ticket/99')).toBe('Support Ticket | DTSS');
	});

	it('picks the LONGEST matching prefix', () => {
		expect(pageTitle('/admin/menu/skills')).toBe('Skills | DTSS');
		expect(pageTitle('/admin/menu')).toBe('Admin Menu | DTSS');
		expect(pageTitle('/admin/menu/mass-notifications/create')).toBe('New Mass Notification | DTSS');
		expect(pageTitle('/admin/menu/mass-notifications/abc')).toBe('Mass Notifications | DTSS');
	});

	it('does not let a prefix match a longer sibling name', () => {
		// "/professionals" must not swallow nothing-in-common; but importantly
		// "/staff" must not match "/staff-something" if that ever existed.
		expect(pageLabel('/staffing')).toBeNull();
	});

	it('handles trailing slashes and the root', () => {
		expect(pageTitle('/dashboard/')).toBe('Dashboard | DTSS');
		expect(pageTitle('/')).toBe('Home | DTSS');
	});

	it('falls back to the app name for unknown routes', () => {
		expect(pageTitle('/some/unknown/thing')).toBe('Dental Temps Staffing Solutions');
	});

	it('titles the auth flow', () => {
		expect(pageTitle('/auth/sign-in')).toBe('Sign In | DTSS');
		expect(pageTitle('/auth/verify/email-abc')).toBe('Verify Email | DTSS');
		expect(pageTitle('/auth/password/update-token123')).toBe('Update Password | DTSS');
	});
});
