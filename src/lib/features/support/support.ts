/** Pure helpers for the support screens. */

/** "Just now", "5 minutes ago", "2 days ago" — same buckets as the old ticket page. */
export function timeAgo(date: Date | string, now: Date = new Date()): string {
	const diffMs = now.getTime() - new Date(date).getTime();
	const mins = Math.floor(diffMs / 60000);
	const hours = Math.floor(mins / 60);
	const days = Math.floor(hours / 24);
	if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
	if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
	if (mins > 0) return `${mins} minute${mins > 1 ? 's' : ''} ago`;
	return 'Just now';
}

const ROLE_LABELS: Record<string, string> = {
	SUPERADMIN: 'DTSS team',
	ADMIN: 'DTSS team',
	CLIENT: 'Practice owner',
	CLIENT_STAFF: 'Practice staff',
	CANDIDATE: 'Professional'
};

/** Who someone is, in plain words, instead of the raw role. */
export function supportRoleLabel(role: string | null | undefined): string {
	if (!role) return '';
	return ROLE_LABELS[role] ?? role.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

export function initials(person: { firstName?: string | null; lastName?: string | null } | null | undefined): string {
	return `${person?.firstName?.[0] ?? ''}${person?.lastName?.[0] ?? ''}`.toUpperCase() || '?';
}

export function fullName(person: { firstName?: string | null; lastName?: string | null } | null | undefined): string {
	return [person?.firstName, person?.lastName].filter(Boolean).join(' ') || 'Unknown';
}

/** Oldest first, so the thread reads top to bottom. Doesn't mutate the input. */
export function sortThread<T extends { comment: { createdAt: Date | string } }>(comments: T[]): T[] {
	return [...comments].sort((a, b) => new Date(a.comment.createdAt).getTime() - new Date(b.comment.createdAt).getTime());
}

/** One page of an in-memory list (the ticket list is loaded whole, capped server-side). */
export function pageOf<T>(rows: T[], page: number, pageSize: number): T[] {
	const start = (Math.max(1, page) - 1) * pageSize;
	return rows.slice(start, start + pageSize);
}
