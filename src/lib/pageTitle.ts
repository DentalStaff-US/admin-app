/**
 * Default <title> for every route, derived from the pathname.
 *
 * Why this exists: SvelteKit only updates <title> when the newly rendered page
 * (or a layout) sets one. Most routes didn't, so navigating from an invoices
 * page to the calendar left "Invoices | DTSS" in the tab. The root layout now
 * renders `pageTitle($page.url.pathname)` in <svelte:head>; a page that sets
 * its own <title> still wins because it renders after the layout.
 *
 * Longest matching prefix wins, so `/admin/menu/skills` beats `/admin/menu`
 * beats `/admin`. A prefix matches at a `/` or `-` boundary only, so `/staff`
 * never claims `/staffing`. Keep entries sorted by specificity only for readability — the
 * lookup sorts by length itself.
 *
 * Pure and dependency-free; unit-tested.
 */
export const APP_TITLE_SUFFIX = 'DTSS';

const TITLES: Record<string, string> = {
	'/': 'Home',
	'/dashboard': 'Dashboard',
	'/calendar': 'Calendar',
	'/inbox': 'Inbox',
	'/settings': 'Settings',
	'/support': 'Support',
	'/support/ticket': 'Support Ticket',
	'/staff': 'Staff',
	'/locations': 'Locations',
	'/clients': 'Clients',
	'/professionals': 'Professionals',
	'/professionals/timesheets': 'Professional Timesheets',
	'/requisitions': 'Requisitions',
	'/timesheets': 'Timesheets',
	'/invoices': 'Invoices',
	'/onboarding': 'Onboarding',
	'/onboarding/client/company': 'Company Setup',
	'/onboarding/client/location': 'Location Setup',
	'/onboarding/client/staff': 'Staff Setup',
	'/onboarding/client/billing': 'Billing Setup',
	'/onboarding/admin/profile': 'Admin Profile Setup',
	'/affiliate-portal': 'Affiliate Portal',

	'/admin': 'Admin',
	'/admin/menu': 'Admin Menu',
	'/admin/menu/admins': 'Admins',
	'/admin/menu/users': 'User Management',
	'/admin/menu/user-import': 'User Import',
	'/admin/menu/affiliates': 'Affiliate Program',
	'/admin/menu/exports': 'Exports',
	'/admin/menu/application-settings': 'Application Settings',
	'/admin/menu/blacklists': 'Candidate Blacklists',
	'/admin/menu/client-locations': 'Client Locations',
	'/admin/menu/disciplines': 'Disciplines',
	'/admin/menu/documents': 'Documents',
	'/admin/menu/emails': 'Emails',
	'/admin/menu/experience-levels': 'Experience Levels',
	'/admin/menu/mass-notifications': 'Mass Notifications',
	'/admin/menu/mass-notifications/create': 'New Mass Notification',
	'/admin/menu/notification-templates': 'Notification Templates',
	'/admin/menu/record-history': 'Record History',
	'/admin/menu/requisition-types': 'Requisition Types',
	'/admin/menu/skill-categories': 'Skill Categories',
	'/admin/menu/skills': 'Skills',
	'/admin/menu/sms': 'SMS',
	'/admin/menu/support-tickets': 'Support Tickets',
	'/admin/menu/transactions': 'Transactions',

	'/auth/sign-in': 'Sign In',
	'/auth/sign-up': 'Create Account',
	'/auth/sign-out': 'Signing Out',
	'/auth/two-factor': 'Two-Factor Authentication',
	'/auth/invite': 'Accept Invitation',
	'/auth/password/reset': 'Reset Password',
	'/auth/password/update': 'Update Password',
	'/auth/verify': 'Verify Email',
	'/auth/oauth': 'Signing In',
	'/unsubscribe': 'Unsubscribe',
	'/partners/apply': 'Become a Partner'
};

// Longest prefix first, computed once.
const ORDERED = Object.keys(TITLES).sort((a, b) => b.length - a.length);

/** The label for a pathname, or null if nothing matches. */
export function pageLabel(pathname: string): string | null {
	const path = pathname.replace(/\/+$/, '') || '/';
	for (const prefix of ORDERED) {
		if (prefix === '/') continue;
		// `-` counts as a boundary too, for hyphenated dynamic routes like
		// /auth/password/update-[token] and /auth/verify/email-[token].
		if (path === prefix || path.startsWith(prefix + '/') || path.startsWith(prefix + '-')) {
			return TITLES[prefix];
		}
	}
	return path === '/' ? TITLES['/'] : null;
}

/** The full document title: "Label | DTSS", or just the app name when unknown. */
export function pageTitle(pathname: string): string {
	const label = pageLabel(pathname);
	return label ? `${label} | ${APP_TITLE_SUFFIX}` : 'Dental Temps Staffing Solutions';
}
