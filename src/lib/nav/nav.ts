/**
 * The admin + practice portal navigation (design doc 05 › A). One list for
 * every role: the order never changes, and items a role can't use are hidden.
 * Replaces the 639-line hand-copied dashboard-nav.svelte.
 */
import type { ComponentType } from 'svelte';
import {
	Briefcase,
	Building2,
	CalendarDays,
	FileText,
	Inbox,
	LayoutGrid,
	LifeBuoy,
	MapPin,
	Receipt,
	Settings,
	Shield,
	ShieldCheck,
	UserRound
} from 'lucide-svelte';
import { checkIsAdmin } from '$lib/_helpers/checkIsAdmin';
import { USER_ROLES } from '$lib/config/constants';
import { pageLabel } from '$lib/pageTitle';

export type NavContext = {
	role: string | null | undefined;
	/** CLIENT_STAFF with the CLIENT_ADMIN staff role (owners count as office admins). */
	isOfficeAdmin?: boolean;
};

export type NavItem = {
	href: string;
	label: string;
	icon: ComponentType;
	/** Extra prefixes that light this item up (e.g. /professionals/… under Professionals). */
	match?: string[];
	/** Which count badge, if any, this item shows. */
	badge?: 'inbox';
	show: (ctx: NavContext) => boolean;
};

export type NavGroup = { label: string | null; items: NavItem[] };

const isAdmin = (ctx: NavContext) => checkIsAdmin(ctx.role ?? undefined);
const isClient = (ctx: NavContext) => ctx.role === USER_ROLES.CLIENT;
const isStaff = (ctx: NavContext) => ctx.role === USER_ROLES.CLIENT_STAFF;
const isPractice = (ctx: NavContext) => isClient(ctx) || isStaff(ctx);
const isOfficeAdmin = (ctx: NavContext) => isClient(ctx) || (isStaff(ctx) && !!ctx.isOfficeAdmin);
const anyone = (ctx: NavContext) => isAdmin(ctx) || isPractice(ctx);

const GROUPS: NavGroup[] = [
	{
		label: null,
		items: [
			{ href: '/dashboard', label: 'Dashboard', icon: LayoutGrid, show: anyone },
			{ href: '/calendar', label: 'Calendar', icon: CalendarDays, show: anyone },
			{ href: '/requisitions', label: 'Requisitions', icon: Briefcase, show: anyone },
			{ href: '/timesheets', label: 'Timesheets', icon: FileText, show: anyone },
			{
				href: '/invoices',
				label: 'Invoices',
				icon: Receipt,
				show: (c) => isAdmin(c) || isOfficeAdmin(c)
			},
			{ href: '/inbox', label: 'Inbox', icon: Inbox, badge: 'inbox', show: anyone }
		]
	},
	{
		label: 'People',
		items: [
			{ href: '/professionals', label: 'Professionals', icon: UserRound, show: isAdmin },
			{ href: '/clients', label: 'Clients', icon: Building2, show: isAdmin },
			{ href: '/locations', label: 'Locations', icon: MapPin, show: isPractice }
		]
	},
	{
		label: 'Account',
		items: [
			{ href: '/admin/compliance', label: 'Compliance', icon: ShieldCheck, show: isAdmin },
			{ href: '/support', label: 'Support', icon: LifeBuoy, show: isPractice },
			{ href: '/settings', label: 'Settings', icon: Settings, show: anyone },
			{ href: '/admin/menu', label: 'Admin', icon: Shield, match: ['/admin'], show: isAdmin }
		]
	}
];

/** The groups this person sees, empty groups dropped. */
export function navFor(ctx: NavContext): NavGroup[] {
	return GROUPS.map((group) => ({
		label: group.label,
		items: group.items
			.filter((item) => item.show(ctx))
	})).filter((group) => group.items.length > 0);
}

const under = (pathname: string, prefix: string) =>
	pathname === prefix || pathname.startsWith(`${prefix}/`);

/**
 * The item to mark current. The longest matching prefix wins, so
 * /admin/compliance lights Compliance rather than Admin.
 */
export function activeHref(pathname: string, groups: NavGroup[]): string | null {
	let best: { href: string; length: number } | null = null;
	for (const item of groups.flatMap((g) => g.items)) {
		for (const prefix of [item.href, ...(item.match ?? [])]) {
			if (under(pathname, prefix) && (!best || prefix.length > best.length)) {
				best = { href: item.href, length: prefix.length };
			}
		}
	}
	return best?.href ?? null;
}

/** Onboarding is a focused flow (05 › Shared rules): no sidebar to wander off through. */
export function usesFocusShell(pathname: string): boolean {
	return under(pathname, '/onboarding');
}

/** Screens that fill the viewport and scroll inside themselves: the two-pane inbox. */
export function fillsScreen(pathname: string): boolean {
	return under(pathname, '/inbox');
}

export const SIDEBAR_COOKIE = 'dtss-sidebar';
export type SidebarState = 'expanded' | 'rail';
export const parseSidebarState = (value: string | undefined | null): SidebarState =>
	value === 'rail' ? 'rail' : 'expanded';

export type Crumb = { label: string; href?: string };

const ID_SEGMENT = /^(\d+|[0-9a-f]{8}-[0-9a-f-]{27,}|[A-Za-z0-9_-]{16,})$/;

/**
 * Top-bar breadcrumbs: the nav section, then where you are inside it.
 * `current` is what the page calls itself (pageLabel), used when it differs
 * from the section. An id segment reads as "#1042" for requisitions and
 * "Details" elsewhere. Pages that need better can render their own header.
 */
export function breadcrumbs(pathname: string, groups: NavGroup[], current: string | null): Crumb[] {
	const href = activeHref(pathname, groups);
	const item = href ? groups.flatMap((g) => g.items).find((i) => i.href === href) : null;
	if (!item) return current ? [{ label: current }] : [];
	const path = pathname.replace(/\/+$/, '');
	if (path === item.href) return [{ label: item.label }];

	const crumbs: Crumb[] = [{ label: item.label, href: item.href }];
	const last = path.split('/').pop() ?? '';
	// The section's own title isn't a new place.
	if (current && current !== item.label && current !== pageLabel(item.href))
		crumbs.push({ label: current });
	else if (ID_SEGMENT.test(last))
		crumbs.push({
			label: item.href === '/requisitions' && /^\d+$/.test(last) ? `#${last}` : 'Details'
		});
	return crumbs;
}
