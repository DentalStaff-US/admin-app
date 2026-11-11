/**
 * The admin menu index (06 › Admin menu): every admin tool, grouped by area.
 * Framework-free so the grouping is testable; icons are passed through untouched.
 */

export const ADMIN_MENU_AREAS = ['People', 'Billing', 'Communication', 'Data', 'System'] as const;
export type AdminMenuArea = (typeof ADMIN_MENU_AREAS)[number];

export type AdminMenuItem<Icon = unknown> = {
	area: AdminMenuArea;
	label: string;
	href: string;
	/** One line saying what the tool is for. */
	description: string;
	icon: Icon;
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
