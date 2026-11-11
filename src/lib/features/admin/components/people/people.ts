/**
 * Pure helpers for the admin People screens (users, admins, affiliates).
 * Framework-free so they can be unit tested.
 */

export type UserRow = {
	id: string;
	firstName: string | null;
	lastName: string | null;
	email: string;
	role: string;
	verified: boolean;
	completedOnboarding: boolean;
	banned: boolean | null;
	banReason: string | null;
	banExpires: string | Date | null;
	createdAt: string | Date;
	companyName: string | null;
	city: string | null;
	state: string | null;
	fullAddress: string | null;
	candidateProfileId: string | null;
	clientProfileId: string | null;
};

/** "Last, First", or "(no name)". */
export function sortableName(row: { firstName: string | null; lastName: string | null }): string {
	const last = row.lastName ?? '';
	const first = row.firstName ?? '';
	return `${last}${last && first ? ', ' : ''}${first}`.trim() || '(no name)';
}

/** "First Last", falling back to the email. */
export function displayName(row: { firstName: string | null; lastName: string | null; email?: string | null }): string {
	return [row.firstName, row.lastName].filter(Boolean).join(' ').trim() || row.email || 'this user';
}

/**
 * Profile page per role. Routes expect the PROFILE id (not user.id):
 *   /professionals/[id] reads candidate_profiles.id
 *   /clients/[id]       reads client_profiles.id (parent profile for CLIENT_STAFF)
 * DTSS staff (SUPERADMIN / ADMIN) have no detail page here, so there's no link.
 */
export function profileHref(row: Pick<UserRow, 'role' | 'candidateProfileId' | 'clientProfileId'>): string | null {
	if (row.role === 'CANDIDATE' && row.candidateProfileId) return `/professionals/${row.candidateProfileId}`;
	if ((row.role === 'CLIENT' || row.role === 'CLIENT_STAFF') && row.clientProfileId)
		return `/clients/${row.clientProfileId}`;
	return null;
}

export function shortAddress(row: Pick<UserRow, 'city' | 'state'>): string {
	return [row.city, row.state].filter(Boolean).join(', ');
}

/** MM/DD/YYYY, as the users table always showed. */
export function formatDate(d: string | Date): string {
	const date = typeof d === 'string' ? new Date(d) : d;
	return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`;
}

const ROLE_LABELS: Record<string, string> = {
	SUPERADMIN: 'Super admin',
	ADMIN: 'Admin',
	CLIENT: 'Practice owner',
	CLIENT_STAFF: 'Practice staff',
	CANDIDATE: 'Professional',
	EXTERNAL_PARTNER: 'External partner'
};

/** Human role label; unknown roles pass through. */
export function roleLabel(role: string | null | undefined): string {
	if (!role) return '—';
	return ROLE_LABELS[role] ?? role;
}

export function money(v: string | number | null | undefined): string {
	const n = Number(v ?? 0);
	const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
	return `${n < 0 ? '-' : ''}$${abs}`;
}

export function shortDate(d: Date | string | null | undefined): string {
	return d ? new Date(d).toLocaleDateString('en-US') : '—';
}

/** Stripe Connect readiness for an affiliate, as a status-map key + label. */
export function payoutReadiness(a: {
	connectPayoutsEnabled?: boolean | null;
	stripeConnectAccountId?: string | null;
}): { status: string; label: string } {
	if (a.connectPayoutsEnabled) return { status: 'ACTIVE', label: 'Ready' };
	if (a.stripeConnectAccountId) return { status: 'PENDING', label: 'Onboarding' };
	return { status: 'INACTIVE', label: 'Not set up' };
}

/** Referred person's type on a referral row. */
export function referredTypeLabel(role: string | null | undefined): string {
	if (role === 'CANDIDATE') return 'Professional';
	if (role === 'EXTERNAL_PARTNER') return 'Partner';
	return 'Practice';
}
