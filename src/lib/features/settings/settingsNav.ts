/**
 * The settings nav (06 › Settings): which sections each audience sees, and
 * which one a URL points at. Section URLs keep the existing
 * `/settings?tab=<KEY>&role=<GROUP>` shape because emails and other pages
 * already link to it (`?tab=BILLING&role=CLIENT`, `?tab=DOCUMENTS&role=CLIENT`).
 * Notifications is its own route and joins the same nav.
 */
import { SETTINGS_MENU_OPTIONS, USER_ROLES } from '$lib/config/constants';
import { checkIsAdmin } from '$lib/_helpers/checkIsAdmin';

/** Which settings screen a user gets. Mirrors the old page's role branches. */
export type SettingsView = 'admin' | 'client' | 'staff';

export type SettingsIcon =
	| 'user'
	| 'building'
	| 'users'
	| 'card'
	| 'file'
	| 'shield'
	| 'bell'
	| 'gift';

export type SettingsSection = {
	/** The SETTINGS_MENU_OPTIONS value the screens switch on, or 'NOTIFICATIONS'. */
	id: string;
	label: string;
	description: string;
	icon: SettingsIcon;
	href: string;
	/** A separate route (Notifications) rather than a section of /settings. */
	route?: boolean;
};

export const NOTIFICATIONS_SECTION_ID = 'NOTIFICATIONS';
export const NOTIFICATIONS_HREF = '/settings/notifications';

type Group = keyof typeof SETTINGS_MENU_OPTIONS;
const GROUP: Record<SettingsView, Group> = { admin: 'ADMIN', client: 'CLIENT', staff: 'CLIENT_STAFF' };

const tabHref = (group: Group, tab: string) => `/settings?tab=${tab}&role=${group}`;

type Def = Omit<SettingsSection, 'id' | 'href'> & { tab: string };

const PROFILE: Def = { tab: 'PROFILE', label: 'Profile', description: 'Your name, photo and contact details', icon: 'user' };
const SECURITY: Def = { tab: 'PASSWORD', label: 'Password & security', description: 'Change your password and set up two-factor sign-in', icon: 'shield' };
const AFFILIATE: Def = { tab: 'AFFILIATE', label: 'Affiliate program', description: 'Earn for practices and professionals you refer', icon: 'gift' };

const DEFS: Record<SettingsView, Def[]> = {
	admin: [PROFILE, SECURITY],
	client: [
		PROFILE,
		{ tab: 'COMPANY', label: 'Practice', description: 'Practice details and operating hours', icon: 'building' },
		{ tab: 'STAFF', label: 'Team', description: 'Invite staff and manage their access', icon: 'users' },
		{ tab: 'BILLING', label: 'Billing', description: 'Billing email, payment method and invoices', icon: 'card' },
		{ tab: 'DOCUMENTS', label: 'Documents', description: 'Agreements and practice documents', icon: 'file' },
		SECURITY,
		AFFILIATE
	],
	staff: [
		PROFILE,
		{ tab: 'COMPANY', label: 'Practice', description: 'Details of the practice you work for', icon: 'building' },
		SECURITY,
		AFFILIATE
	]
};

/** The screen for a role. `hasAdminRights` = CLIENT, or CLIENT_STAFF with CLIENT_ADMIN. */
export function settingsViewFor(role: string | null | undefined, hasAdminRights: boolean): SettingsView | null {
	if (checkIsAdmin(role ?? undefined)) return 'admin';
	if (role === USER_ROLES.CLIENT || (role === USER_ROLES.CLIENT_STAFF && hasAdminRights)) return 'client';
	if (role === USER_ROLES.CLIENT_STAFF) return 'staff';
	return null;
}

/** The nav, in order. The affiliate row only shows when the program is open to this user. */
export function settingsSections(view: SettingsView, opts: { affiliate?: boolean } = {}): SettingsSection[] {
	const group = GROUP[view];
	const options = SETTINGS_MENU_OPTIONS[group] as Record<string, string>;
	const sections: SettingsSection[] = DEFS[view]
		.filter((def) => def !== AFFILIATE || opts.affiliate)
		.map(({ tab, ...rest }) => ({ ...rest, id: options[tab], href: tabHref(group, tab) }));
	// Notifications sits with the account rows, before the affiliate program.
	const at = sections.findIndex((s) => s.icon === 'shield') + 1;
	sections.splice(at, 0, {
		id: NOTIFICATIONS_SECTION_ID,
		label: 'Notifications',
		description: 'Announcement emails and texts',
		icon: 'bell',
		href: NOTIFICATIONS_HREF,
		route: true
	});
	return sections;
}

/**
 * The section a /settings URL asks for. `explicit` is false when the URL names
 * no section (or one this view doesn't have): desktop then shows the first
 * section, and phones show the list.
 */
export function resolveSection(view: SettingsView, url: URL, sections = settingsSections(view, { affiliate: true })) {
	const tab = url.searchParams.get('tab');
	const role = url.searchParams.get('role');
	const group = role && Object.hasOwn(SETTINGS_MENU_OPTIONS, role) ? SETTINGS_MENU_OPTIONS[role as Group] : null;
	const id = group && tab && Object.hasOwn(group, tab) ? (group as Record<string, string>)[tab] : undefined;
	const match = id ? sections.find((s) => s.id === id && !s.route) : undefined;
	return { id: match?.id ?? sections[0].id, explicit: Boolean(match) };
}
