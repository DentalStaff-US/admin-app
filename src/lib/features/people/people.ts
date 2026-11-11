/**
 * Pure helpers for the people screens (professionals, clients, locations,
 * practice staff). Framework-free so they can be unit tested; components in
 * ./components import from here.
 */
import type { StatusTone } from '$tokens/status';
import type { SortState } from '$lib/components/dtss/tableState';
import type { CertState } from '$lib/credentialStatusDisplay';

/** "MG" from Maria Gonzalez; "?" when both are blank. */
export function initialsOf(first?: string | null, last?: string | null): string {
	const value = `${first?.trim()?.[0] ?? ''}${last?.trim()?.[0] ?? ''}`.toUpperCase();
	return value || '?';
}

/** "Maria Gonzalez", falling back to the email, then a generic noun. */
export function displayName(
	first?: string | null,
	last?: string | null,
	fallback = 'Unnamed'
): string {
	return [first, last].map((part) => part?.trim()).filter(Boolean).join(' ') || fallback;
}

/**
 * Candidate and client profiles share four statuses. The admin word for ACTIVE
 * is "Approved" (it's what the status menu has always said), so the badge and
 * the menu agree.
 */
export const PROFILE_STATUSES = ['PENDING', 'ACTIVE', 'INACTIVE', 'DENIED'] as const;
export type ProfileStatus = (typeof PROFILE_STATUSES)[number];

export function profileStatusLabel(status: string | null | undefined): string {
	switch (status) {
		case 'ACTIVE':
			return 'Approved';
		case 'DENIED':
			return 'Denied';
		case 'INACTIVE':
			return 'Inactive';
		default:
			return 'Pending';
	}
}

export type StatusChangeCopy = {
	title: string;
	description: string;
	confirmLabel: string;
	tone: 'default' | 'destructive' | 'success';
};

/**
 * What a status change does, said in the confirmation (03 › Which overlay:
 * name the object and the consequence). The consequences mirror the
 * `updateStatus` actions: a professional's onboarding flag and affiliate
 * eligibility follow ACTIVE; a practice is emailed about every change.
 */
export function statusChangeCopy(
	kind: 'professional' | 'client',
	name: string,
	next: ProfileStatus
): StatusChangeCopy {
	const notify =
		kind === 'client' ? ' The practice is emailed about the change.' : '';
	switch (next) {
		case 'ACTIVE':
			return {
				title: `Approve ${name}?`,
				description:
					kind === 'professional'
						? `${name} can sign in to the professional app and be matched to shifts.`
						: `${name} can post requests and be billed.${notify}`,
				confirmLabel: 'Approve',
				tone: 'success'
			};
		case 'DENIED':
			return {
				title: `Deny ${name}?`,
				description:
					kind === 'professional'
						? `${name} loses access to shifts, and any affiliate earnings are put on hold.`
						: `${name} can no longer use the practice portal, and any affiliate earnings are put on hold.${notify}`,
				confirmLabel: 'Deny',
				tone: 'destructive'
			};
		case 'INACTIVE':
			return {
				title: `Deactivate ${name}?`,
				description:
					kind === 'professional'
						? `${name} stops being matched to shifts, and any affiliate earnings are put on hold. You can reactivate them later.`
						: `${name} is marked inactive and any affiliate earnings are put on hold. You can reactivate them later.${notify}`,
				confirmLabel: 'Deactivate',
				tone: 'destructive'
			};
		default:
			return {
				title: `Move ${name} back to pending?`,
				description:
					kind === 'professional'
						? `${name} goes back into review and stops being matched to shifts until approved again.`
						: `${name} goes back into review.${notify}`,
				confirmLabel: 'Set to pending',
				tone: 'default'
			};
	}
}

/** Credential state → StatusBadge tone (03 › StatusBadge replaces `credentialBadge()` classes). */
export function credentialTone(state: CertState): StatusTone {
	switch (state) {
		case 'VALID':
			return 'positive';
		case 'EXPIRING':
		case 'MISSING_GRACE':
			return 'warning';
		case 'MISSING':
		case 'EXPIRED':
			return 'negative';
		default:
			return 'neutral';
	}
}

/** Mirrors WORK_PREFERENCE_LABELS in $lib/server/workPreference (server-only). */
export const WORK_PREFERENCE_CHOICES = [
	{ value: 'BOTH', label: 'Both temporary and permanent' },
	{ value: 'TEMP', label: 'Temporary shifts only' },
	{ value: 'PERMANENT', label: 'Permanent positions only' }
] as const;

export function workPreferenceLabel(value: string | null | undefined): string {
	return WORK_PREFERENCE_CHOICES.find((c) => c.value === (value ?? 'BOTH'))?.label ?? 'Both';
}

/** "123 Main St, Suite 4" + "Tampa, FL 33602" as one line, skipping blanks. */
export function joinAddress(parts: {
	street?: string | null;
	street2?: string | null;
	city?: string | null;
	state?: string | null;
	zip?: string | null;
}): string {
	const line1 = [parts.street, parts.street2].filter(Boolean).join(', ');
	const stateZip = [parts.state, parts.zip].filter(Boolean).join(' ');
	const line2 = [parts.city, stateZip].filter(Boolean).join(', ');
	return [line1, line2].filter(Boolean).join(', ');
}

/** `?sort=&dir=` when the column is allowed; null keeps the server's order. */
export function readOptionalSort(url: URL, allowed: readonly string[]): SortState | null {
	const column = url.searchParams.get('sort');
	if (!column || !allowed.includes(column)) return null;
	return { column, direction: url.searchParams.get('dir') === 'asc' ? 'asc' : 'desc' };
}

type SortValue = string | number | Date | null | undefined;

/**
 * Sorts a fully loaded list by a URL sort (the people lists load every row,
 * so sorting stays in the browser but lives in the URL like DataTable expects).
 * Blanks always sort last; strings compare case-insensitively.
 */
export function sortRows<T>(
	rows: readonly T[],
	sort: SortState | null,
	accessors: Record<string, (row: T) => SortValue>
): T[] {
	if (!sort) return [...rows];
	const get = accessors[sort.column];
	if (!get) return [...rows];
	const dir = sort.direction === 'asc' ? 1 : -1;
	const norm = (v: SortValue) =>
		v instanceof Date ? v.getTime() : typeof v === 'string' ? v.toLowerCase() : v;
	return [...rows].sort((a, b) => {
		const x = norm(get(a));
		const y = norm(get(b));
		const xBlank = x === null || x === undefined || x === '';
		const yBlank = y === null || y === undefined || y === '';
		if (xBlank || yBlank) return xBlank === yBlank ? 0 : xBlank ? 1 : -1;
		if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir;
		return String(x).localeCompare(String(y)) * dir;
	});
}

/** Client-side page slice for lists that load every row. */
export function pageSlice<T>(rows: readonly T[], page: number, pageSize: number): T[] {
	const start = (Math.max(1, page) - 1) * pageSize;
	return rows.slice(start, start + pageSize);
}

/** Pagination clamp: a page past the end shows the last page. */
export function clampPage(page: number, total: number, pageSize: number): number {
	const last = Math.max(1, Math.ceil(total / pageSize));
	return Math.min(Math.max(1, page), last);
}

export type ActivityLike = {
	id: string | number;
	createdAt: Date | string;
	action: string;
	actorName?: string | null;
	summary?: string | null;
};

const ACTION_TONE: Record<string, StatusTone> = {
	CREATE: 'positive',
	APPROVE: 'positive',
	UPDATE: 'info',
	DELETE: 'negative',
	DENY: 'negative',
	CANCEL: 'neutral',
	VIEW: 'neutral'
};

/** Tone for a ledger row's dot on the History timeline. */
export function activityTone(action: string): StatusTone {
	return ACTION_TONE[action] ?? 'neutral';
}

type LedgerRow = {
	id: string;
	createdAt: Date | string;
	action: string;
	entityType: string;
	actorName: string | null;
	impersonatorName?: string | null;
	metadata?: Record<string, unknown> | null;
};

/**
 * action_history rows → Timeline entries: "{actor} {verb} {entity}", plus the
 * changed field when the row names one. Labels come from $lib/audit/constants.
 */
export function ledgerToTimeline(
	rows: readonly LedgerRow[],
	labels: { action: Record<string, string>; entity: Record<string, string> }
) {
	return rows.map((row) => {
		const verb = labels.action[row.action] ?? row.action.toLowerCase().replace(/_/g, ' ');
		const noun = labels.entity[row.entityType] ?? row.entityType.toLowerCase();
		const field = typeof row.metadata?.field === 'string' ? ` (${row.metadata.field})` : '';
		const via = row.impersonatorName ? ` · via ${row.impersonatorName}` : '';
		return {
			id: row.id,
			at: row.createdAt,
			actor: row.actorName ?? 'System',
			text: `${verb} this ${noun}${field}${via}`,
			tone: activityTone(row.action)
		};
	});
}

/** Staff role → label, matching STAFF_ROLE_ENUM wording in one place. */
export function staffRoleLabel(role: string | null | undefined): string {
	switch (role) {
		case 'CLIENT_ADMIN':
			return 'Admin';
		case 'CLIENT_MANAGER':
			return 'Manager';
		case 'CLIENT_EMPLOYEE':
			return 'Employee';
		default:
			return role ?? '—';
	}
}

/** Tab ids from `?tab=`, falling back to the first allowed tab. */
export function readTab<T extends string>(value: string | null, allowed: readonly T[]): T {
	return (allowed as readonly string[]).includes(value ?? '') ? (value as T) : allowed[0];
}

type WorkedShift = {
	recurrenceDay: { dayStart: Date | string };
	requisition: { id: number; title?: string | null; companyName?: string | null };
	timesheet: {
		id: string;
		status?: string | null;
		weekBeginDate?: string | null;
		totalHoursWorked?: string | number | null;
	} | null;
};

export type TimesheetSummary = {
	id: string;
	status: string | null;
	weekBeginDate: string | null;
	totalHoursWorked: number | null;
	practice: string | null;
	requisitionId: number;
	shifts: number;
};

/**
 * The work-history query returns one row per worked day; a timesheet covers a
 * week of them. Collapse to one row per timesheet, newest week first.
 */
export function timesheetsFromShifts(shifts: readonly WorkedShift[]): TimesheetSummary[] {
	const byId = new Map<string, TimesheetSummary>();
	for (const shift of shifts) {
		const sheet = shift.timesheet;
		if (!sheet?.id) continue;
		const existing = byId.get(sheet.id);
		if (existing) {
			existing.shifts += 1;
			continue;
		}
		const hours = sheet.totalHoursWorked === null || sheet.totalHoursWorked === undefined ? null : Number(sheet.totalHoursWorked);
		byId.set(sheet.id, {
			id: sheet.id,
			status: sheet.status ?? null,
			weekBeginDate: sheet.weekBeginDate ?? null,
			totalHoursWorked: Number.isFinite(hours) ? hours : null,
			practice: shift.requisition.companyName ?? null,
			requisitionId: shift.requisition.id,
			shifts: 1
		});
	}
	return [...byId.values()].sort((a, b) => (b.weekBeginDate ?? '').localeCompare(a.weekBeginDate ?? ''));
}
