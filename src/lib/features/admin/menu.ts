/**
 * The admin menu index (06 › Admin menu): every admin tool, grouped by area.
 * Framework-free so the grouping is testable; icons are passed through untouched.
 */

import { can, type Permission } from '$lib/authz';

export const ADMIN_MENU_AREAS = ['People', 'Billing', 'Communication', 'Data', 'System'] as const;
export type AdminMenuArea = (typeof ADMIN_MENU_AREAS)[number];

export type AdminMenuItem<Icon = unknown> = {
	area: AdminMenuArea;
	label: string;
	href: string;
	/** One line saying what the tool is for. */
	description: string;
	icon: Icon;
	/** The role-matrix permission the tool needs. Omitted = any DTSS admin. */
	permission?: Permission;
};

export type AdminMenuGroup<Icon = unknown> = {
	area: AdminMenuArea;
	items: AdminMenuItem<Icon>[];
};

/** Items grouped in the fixed area order; empty areas dropped; item order kept. */
export function groupAdminMenu<Icon>(items: AdminMenuItem<Icon>[]): AdminMenuGroup<Icon>[] {
	return ADMIN_MENU_AREAS.map((area) => ({
		area,
		items: items.filter((item) => item.area === area)
	})).filter((group) => group.items.length > 0);
}

/** The tools this user (or role) may open; the server enforces the same permission. */
export function adminMenuFor<Icon>(
	items: AdminMenuItem<Icon>[],
	user: string | { role?: string | null } | null | undefined
): AdminMenuItem<Icon>[] {
	return items.filter((item) => !item.permission || can(user, item.permission));
}

/** Case-insensitive match on the label or description, for the menu's filter box. */
export function filterAdminMenu<Icon>(items: AdminMenuItem<Icon>[], query: string): AdminMenuItem<Icon>[] {
	const q = query.trim().toLowerCase();
	if (!q) return items;
	return items.filter(
		(item) =>
			item.label.toLowerCase().includes(q) ||
			item.description.toLowerCase().includes(q) ||
			item.area.toLowerCase().includes(q)
	);
}
