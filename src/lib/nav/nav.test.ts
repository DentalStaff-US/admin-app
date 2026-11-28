import { describe, expect, it } from 'vitest';
import {
	activeHref,
	TEAM_HREF,
	breadcrumbs,
	fillsScreen,
	navFor,
	parseSidebarState,
	usesFocusShell
} from './nav';

const hrefs = (role: string, isOfficeAdmin = false) =>
	navFor({ role, isOfficeAdmin }).flatMap((g) => g.items.map((i) => i.href));

describe('navFor', () => {
	it('gives SUPERADMIN and ADMIN the same admin navigation', () => {
		const admin = [
			'/dashboard',
			'/calendar',
			'/requisitions',
			'/timesheets',
			'/invoices',
			'/inbox',
			'/professionals',
			'/clients',
			'/admin/compliance',
			'/settings',
			'/admin/menu'
		];
		expect(hrefs('SUPERADMIN')).toEqual(admin);
		// ADMIN had no navigation at all before (only SUPERADMIN was rendered).
		expect(hrefs('ADMIN')).toEqual(admin);
	});

	it('gives practice owners their own items, in the same order', () => {
		expect(hrefs('CLIENT')).toEqual([
			'/dashboard',
			'/calendar',
			'/requisitions',
			'/timesheets',
			'/invoices',
			'/inbox',
			'/team',
			'/locations',
			'/support',
			'/settings'
		]);
	});

	it('gives staff Timesheets, and Invoices only as office admins', () => {
		const staff = hrefs('CLIENT_STAFF');
		expect(staff).toContain('/timesheets');
		expect(staff).not.toContain('/invoices');
		const officeAdmin = hrefs('CLIENT_STAFF', true);
		expect(officeAdmin).toContain('/invoices');
		expect(staff).not.toContain(TEAM_HREF);
		expect(officeAdmin).toContain(TEAM_HREF);
	});

	it('never shows admin-only areas to practices', () => {
		for (const role of ['CLIENT', 'CLIENT_STAFF']) {
			const items = hrefs(role, true);
			for (const adminOnly of ['/professionals', '/clients', '/admin/menu', '/admin/compliance']) {
				expect(items).not.toContain(adminOnly);
			}
		}
	});

	it('shows nothing to roles that do not belong in this app', () => {
		expect(navFor({ role: 'CANDIDATE' })).toEqual([]);
		expect(navFor({ role: undefined })).toEqual([]);
	});

	it('calls them "Requisitions" for admins and practices alike', () => {
		const label = (role: string) =>
			navFor({ role })
				.flatMap((g) => g.items)
				.find((i) => i.href === '/requisitions')?.label;
		expect(label('SUPERADMIN')).toBe('Requisitions');
		expect(label('CLIENT')).toBe('Requisitions');
	});
});

describe('activeHref', () => {
	const admin = navFor({ role: 'SUPERADMIN' });

	it('matches on route prefix', () => {
		expect(activeHref('/requisitions/1042', admin)).toBe('/requisitions');
		expect(activeHref('/dashboard', admin)).toBe('/dashboard');
	});

	it('prefers the longest prefix', () => {
		expect(activeHref('/admin/compliance', admin)).toBe('/admin/compliance');
		expect(activeHref('/admin/menu/skills', admin)).toBe('/admin/menu');
		expect(activeHref('/admin/impersonation', admin)).toBe('/admin/menu');
	});

	it('does not match partial segments', () => {
		expect(activeHref('/requisitionsx', admin)).toBeNull();
	});
});

describe('shell modes', () => {
	it('uses the focus shell for onboarding only', () => {
		expect(usesFocusShell('/onboarding/client/company')).toBe(true);
		expect(usesFocusShell('/dashboard')).toBe(false);
	});

	it('fills the screen for the two-pane inbox only', () => {
		expect(fillsScreen('/inbox/abc')).toBe(true);
		expect(fillsScreen('/inbox')).toBe(true);
		expect(fillsScreen('/inboxes')).toBe(false);
		expect(fillsScreen('/dashboard')).toBe(false);
	});

	it('reads the sidebar cookie, defaulting to expanded', () => {
		expect(parseSidebarState('rail')).toBe('rail');
		expect(parseSidebarState('expanded')).toBe('expanded');
		expect(parseSidebarState(undefined)).toBe('expanded');
		expect(parseSidebarState('junk')).toBe('expanded');
	});
});

describe('breadcrumbs', () => {
	const admin = navFor({ role: 'SUPERADMIN' });
	const client = navFor({ role: 'CLIENT' });

	it('is just the section on a section page', () => {
		expect(breadcrumbs('/timesheets', admin, 'Timesheets')).toEqual([{ label: 'Timesheets' }]);
	});

	it('links back to the section from a record', () => {
		expect(breadcrumbs('/requisitions/1042', admin, 'Requisitions')).toEqual([
			{ label: 'Requisitions', href: '/requisitions' },
			{ label: '#1042' }
		]);
		expect(breadcrumbs('/requisitions/1042', client, 'Requisitions')).toEqual([
			{ label: 'Requisitions', href: '/requisitions' },
			{ label: '#1042' }
		]);
		expect(
			breadcrumbs('/professionals/3f2a9c1e-1111-2222-3333-444455556666', admin, 'Professionals')
		).toEqual([{ label: 'Professionals', href: '/professionals' }, { label: 'Details' }]);
	});

	it('uses the page label inside a section when it has one', () => {
		expect(breadcrumbs('/admin/menu/skills', admin, 'Skills')).toEqual([
			{ label: 'Admin', href: '/admin/menu' },
			{ label: 'Skills' }
		]);
	});
});

describe('Team in the Practice section', () => {
	const groups = navFor({ role: 'CLIENT' });
	it('sits above Locations under Practice', () => {
		const practice = groups.find((g) => g.label === 'Practice');
		expect(practice?.items.map((i) => i.label)).toEqual(['Team', 'Locations']);
	});
	it('matches a query href only on that exact page and params', () => {
		const withQuery = [{ label: null, items: [{ href: '/settings?tab=STAFF', label: 'X', icon: groups[0].items[0].icon, show: () => true }, groups[0].items[0]] }];
		expect(activeHref('/settings', withQuery, '?tab=STAFF&role=CLIENT')).toBe('/settings?tab=STAFF');
		expect(activeHref('/settings', withQuery, '?tab=BILLING')).toBeNull();
	});
});
