import { describe, expect, it } from 'vitest';
import { ADMIN_MENU_AREAS, filterAdminMenu, groupAdminMenu, type AdminMenuItem } from './menu';
import { ADMIN_MENU_ITEMS } from './adminMenuItems';

const item = (area: AdminMenuItem['area'], label: string): AdminMenuItem => ({
	area,
	label,
	href: `/${label.toLowerCase()}`,
	description: `${label} tool`,
	icon: null
});

describe('groupAdminMenu', () => {
	it('orders areas People, Billing, Communication, Data, System and drops empty ones', () => {
		const groups = groupAdminMenu([item('System', 'Skills'), item('People', 'Admins'), item('Data', 'Exports')]);
		expect(groups.map((g) => g.area)).toEqual(['People', 'Data', 'System']);
	});

	it('keeps item order within an area', () => {
		const groups = groupAdminMenu([item('People', 'B'), item('People', 'A')]);
		expect(groups[0].items.map((i) => i.label)).toEqual(['B', 'A']);
	});
});

describe('filterAdminMenu', () => {
	const items = [item('People', 'Admins'), item('Billing', 'Timesheets')];
	it('returns everything for a blank query', () => {
		expect(filterAdminMenu(items, '  ')).toHaveLength(2);
	});
	it('matches label, description or area, ignoring case', () => {
		expect(filterAdminMenu(items, 'ADMIN').map((i) => i.label)).toEqual(['Admins']);
		expect(filterAdminMenu(items, 'billing').map((i) => i.label)).toEqual(['Timesheets']);
		expect(filterAdminMenu(items, 'tool')).toHaveLength(2);
	});
});

describe('ADMIN_MENU_ITEMS', () => {
	it('has unique links, every area, and a description for each tool', () => {
		const hrefs = ADMIN_MENU_ITEMS.map((i) => i.href);
		expect(new Set(hrefs).size).toBe(hrefs.length);
		expect(new Set(ADMIN_MENU_ITEMS.map((i) => i.area))).toEqual(new Set(ADMIN_MENU_AREAS));
		for (const i of ADMIN_MENU_ITEMS) expect(i.description.length).toBeGreaterThan(0);
	});

	it('keeps every tool the old menu linked to', () => {
		const old = [
			'/admin/menu/admins', '/professionals', '/clients', '/admin/menu/users', '/admin/menu/user-import',
			'/requisitions', '/timesheets', '/admin/menu/experience-levels', '/admin/menu/skill-categories',
			'/admin/menu/skills', '/admin/menu/disciplines', '/support', '/admin/menu/blacklists',
			'/admin/menu/record-history', '/admin/menu/documents', '/admin/menu/application-settings',
			'/admin/menu/affiliates', '/admin/menu/exports', '/admin/menu/mass-notifications'
		];
		for (const href of old) expect(ADMIN_MENU_ITEMS.map((i) => i.href)).toContain(href);
	});
});
