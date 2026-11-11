/**
 * Timeline entries (03 › Timeline) for a timesheet or invoice: the admin view
 * reads the action_history ledger; practices don't get the ledger, so their
 * trail is derived from the sheet's own timestamps and its expenses.
 *
 * Shared with features/invoices through this feature's index. It belongs in a
 * future features/audit folder alongside ActivityLog.
 */
import type { StatusTone } from '$tokens/status';
import { ACTION_LABELS, ENTITY_LABELS, type ActivityEntry } from '$lib/audit/constants';
import { usd } from './timesheets';

export type HistoryEntry = {
	id: string | number;
	at: Date | string;
	actor?: string | null;
	text: string;
	tone: StatusTone;
};

const ROLE_LABELS: Record<string, string> = {
	SUPERADMIN: 'Admin',
	ADMIN: 'Admin',
	CLIENT: 'Practice',
	CLIENT_STAFF: 'Practice staff',
	CANDIDATE: 'Professional'
};

export function auditTone(action: string): StatusTone {
	switch (action) {
		case 'APPROVE':
		case 'PAYMENT_RECORDED':
			return 'positive';
		case 'REJECT':
		case 'VOID':
		case 'CANCEL':
		case 'DELETE':
		case 'BLACKLIST':
		case 'PAYMENT_REVERSED':
			return 'negative';
		case 'SUBMIT':
		case 'RESUBMIT':
			return 'pending';
		case 'VIEW':
		case 'DOWNLOAD':
			return 'neutral';
		default:
			return 'info';
	}
}

/** Ledger rows → timeline entries, newest first. Views are opt-in: they swamp the trail. */
export function auditToTimeline(
	entries: ActivityEntry[] | null | undefined,
	{ includeViews = false }: { includeViews?: boolean } = {}
): HistoryEntry[] {
	return (entries ?? [])
		.filter((e) => includeViews || (e.action !== 'VIEW' && e.action !== 'DOWNLOAD'))
		.map((e) => {
			const role = e.actorRole ? ROLE_LABELS[e.actorRole] ?? e.actorRole : null;
			const name = e.actorName ?? (e.userId ? 'Deleted user' : 'System');
			const label = ACTION_LABELS[e.action as keyof typeof ACTION_LABELS] ?? e.action.toLowerCase().replace(/_/g, ' ');
			// Expense rows are filed under TIMESHEETS with the expense's id.
			const noun =
				e.metadata?.kind === 'TIMESHEET_EXPENSE'
					? 'an expense'
					: `this ${ENTITY_LABELS[e.entityType as keyof typeof ENTITY_LABELS] ?? e.entityType.toLowerCase()}`;
			const by = e.impersonatedBy ? ` (impersonated by ${e.impersonatorName ?? e.impersonatedBy})` : '';
			return {
				id: e.id,
				at: e.createdAt,
				actor: role ? `${name} (${role})` : name,
				text: `${label} ${noun}${by}`,
				tone: auditTone(e.action)
			};
		})
		.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

export function countViews(entries: ActivityEntry[] | null | undefined): number {
	return (entries ?? []).filter((e) => e.action === 'VIEW' || e.action === 'DOWNLOAD').length;
}

type ExpenseLike = {
	id: string;
	description: string;
	amountCents: number;
	status: string;
	createdAt: Date | string;
	approvedAt?: Date | string | null;
	updatedAt?: Date | string | null;
	rejectionReason?: string | null;
};

const STATUS_EVENT: Record<string, { text: string; tone: StatusTone }> = {
	PENDING: { text: 'Submitted for review', tone: 'pending' },
	APPROVED: { text: 'Approved', tone: 'positive' },
	DISCREPANCY: { text: 'Sent back for correction', tone: 'warning' },
	REJECTED: { text: 'Rejected', tone: 'negative' },
	VOID: { text: 'Voided', tone: 'negative' }
};

/**
 * What a practice can see happened to its timesheet, from the sheet itself:
 * created, the latest status change, and each expense. Newest first.
 */
export function practiceTimeline(
	timesheet: {
		createdAt?: Date | string | null;
		updatedAt?: Date | string | null;
		status?: string | null;
		discrepancyNote?: string | null;
	} | null | undefined,
	expenses: ExpenseLike[] = []
): HistoryEntry[] {
	const out: HistoryEntry[] = [];
	if (timesheet?.createdAt) out.push({ id: 'created', at: timesheet.createdAt, text: 'Timesheet created', tone: 'neutral' });
	const event = timesheet?.status ? STATUS_EVENT[timesheet.status] : undefined;
	if (event && timesheet?.updatedAt) {
		const note = timesheet.status === 'DISCREPANCY' && timesheet.discrepancyNote ? `: “${timesheet.discrepancyNote}”` : '';
		out.push({ id: 'status', at: timesheet.updatedAt, text: `${event.text}${note}`, tone: event.tone });
	}
	for (const e of expenses) {
		const what = `${e.description} (${usd(e.amountCents / 100)})`;
		out.push({ id: `exp-${e.id}`, at: e.createdAt, text: `Expense added: ${what}`, tone: 'info' });
		if (e.status === 'APPROVED' && e.approvedAt)
			out.push({ id: `exp-${e.id}-ok`, at: e.approvedAt, text: `Expense approved: ${what}`, tone: 'positive' });
		if (e.status === 'REJECTED' && e.updatedAt)
			out.push({
				id: `exp-${e.id}-no`,
				at: e.updatedAt,
				text: `Expense rejected: ${what}${e.rejectionReason ? `: “${e.rejectionReason}”` : ''}`,
				tone: 'negative'
			});
	}
	return out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}
