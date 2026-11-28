/**
 * Needs attention rules (10 §3.1): one pure function per kind, turning a row from
 * its thin query into an AttentionItem. Modelled on `ComplianceItem` (a pure,
 * tested rule fed by a query). No DB imports, so these are tested directly.
 */
import { KIND_META } from '../attention';
import {
	daysPast,
	formatAge,
	formatMoney,
	formatTimeRange,
	formatWeek,
	fullName,
	plural,
	relativeDay,
	shortName
} from '../format';
import { ACTION_HINTS } from '../hints';
import type { AttentionItem, AttentionKind } from '../types';

export type Audience = 'admin' | 'practice';

function base(kind: AttentionKind, id: string): Pick<AttentionItem, 'id' | 'kind' | 'tone'> {
	return { id: `${kind}:${id}`, kind, tone: KIND_META[kind].tone };
}

// --- Shifts ----------------------------------------------------------------

export type UnfilledShiftRow = {
	id: string;
	requisitionId: number;
	createdAt: Date;
	dayStart: Date;
	dayEnd: Date;
	timezone: string;
	disciplineName: string;
	companyName: string | null;
	locationName: string | null;
};

export function unfilledSoonItem(row: UnfilledShiftRow, now: Date = new Date()): AttentionItem {
	return {
		...base('UNFILLED_SOON', row.id),
		title: `${row.disciplineName} · ${row.companyName ?? 'Unknown practice'}`,
		detail: `${relativeDay(row.dayStart, row.timezone, now)} ${formatTimeRange(row.dayStart, row.dayEnd, row.timezone)} · not filled`,
		since: row.createdAt,
		dueAt: row.dayStart,
		href: `/requisitions/${row.requisitionId}`,
		location: row.locationName,
		action: { label: 'Find coverage', href: `/requisitions/${row.requisitionId}`, hint: ACTION_HINTS.findCoverage }
	};
}

// --- Timesheets --------------------------------------------------------------

export type TimesheetRow = {
	id: string;
	weekBeginDate: string;
	totalHoursWorked: string | number | null;
	since: Date;
	candidateFirstName: string | null;
	candidateLastName: string | null;
	companyName: string | null;
	disciplineName: string | null;
	locationName: string | null;
};

function hours(value: string | number | null): string {
	const n = Number(value ?? 0);
	return `${Number.isFinite(n) ? Math.round(n * 100) / 100 : 0}h`;
}

export function discrepancyItem(row: TimesheetRow): AttentionItem {
	const who = fullName(row.candidateFirstName, row.candidateLastName);
	return {
		...base('TIMESHEET_DISCREPANCY', row.id),
		title: `Timesheet discrepancy · ${who} · ${formatWeek(row.weekBeginDate)}`,
		detail: [row.companyName, row.disciplineName, hours(row.totalHoursWorked)]
			.filter(Boolean)
			.join(' · '),
		since: row.since,
		href: `/timesheets/${row.id}`,
		location: row.locationName,
		action: { label: 'Review', href: `/timesheets/${row.id}`, hint: ACTION_HINTS.reviewDiscrepancy }
	};
}

export type PendingTimesheetOptions = {
	audience: Audience;
	canApprove: boolean;
	/** "Dana (owner)": who approves when this user can't. */
	approverName?: string | null;
};

/**
 * PENDING only (never DRAFT: a draft waits on the professional). PENDING has no
 * discrepancy by definition, so it can be approved inline (10 §3.1).
 */
export function pendingTimesheetItem(row: TimesheetRow, opts: PendingTimesheetOptions): AttentionItem {
	const who = fullName(row.candidateFirstName, row.candidateLastName);
	const week = formatWeek(row.weekBeginDate);
	const h = hours(row.totalHoursWorked);
	const parts = opts.audience === 'admin' ? [row.companyName, row.disciplineName, h] : [row.disciplineName, h];
	const item: AttentionItem = {
		...base('TIMESHEET_PENDING', row.id),
		title: `Timesheet · ${who} · ${week}`,
		detail: parts.filter(Boolean).join(' · '),
		since: row.since,
		href: `/timesheets/${row.id}`,
		location: row.locationName,
		action: { label: 'Review', href: `/timesheets/${row.id}` }
	};
	if (opts.canApprove) {
		item.action = {
			label: 'Approve',
			hint: ACTION_HINTS.approveTimesheet,
			form: {
				action: '?/approveTimesheet',
				fields: { timesheetId: row.id },
				confirm: {
					title: `Approve ${who}'s hours?`,
					description: `${h} for ${week}${row.companyName && opts.audience === 'admin' ? ` at ${row.companyName}` : ''} will be locked and added to this week's invoice.`,
					confirmLabel: 'Approve hours'
				}
			}
		};
		item.secondary = { label: 'Review', href: `/timesheets/${row.id}` };
	} else if (opts.approverName) {
		item.action = { label: 'View', href: `/timesheets/${row.id}` };
		item.note = `Waiting on ${opts.approverName}`;
	}
	return item;
}

// --- Billing -----------------------------------------------------------------

export type InvoiceRow = {
	id: string;
	invoiceNumber: string;
	amountRemaining: string | number | null;
	dueDate: Date | null;
	createdAt: Date;
	companyName: string | null;
	hostedUrl?: string | null;
	/** client_profiles.client_invoice_method. PAPER overrides a live Stripe customer. */
	invoiceMethod?: string | null;
	locationName?: string | null;
	/** The timesheet it bills, when it bills one. */
	candidateFirstName?: string | null;
	candidateLastName?: string | null;
	weekBeginDate?: string | null;
};

/** Whose hours and which week, matching the timesheet's own title. */
function invoiceFor(row: InvoiceRow): string[] {
	const who = [row.candidateFirstName, row.candidateLastName].some(Boolean)
		? [fullName(row.candidateFirstName, row.candidateLastName)]
		: [];
	return row.weekBeginDate ? [...who, formatWeek(row.weekBeginDate)] : who;
}

function payAction(row: InvoiceRow) {
	// A PAPER client never gets a Stripe pay link, even if one exists.
	if (row.hostedUrl && row.invoiceMethod !== 'PAPER') {
		return { label: 'Pay invoice', href: row.hostedUrl, external: true, hint: ACTION_HINTS.payInvoice };
	}
	return { label: 'View invoice', href: `/invoices/${row.id}` };
}

export function overdueInvoiceItem(row: InvoiceRow, audience: Audience, now: Date = new Date()): AttentionItem {
	const late = row.dueDate ? daysPast(row.dueDate, now) : 0;
	const amount = formatMoney(Number(row.amountRemaining ?? 0));
	return {
		...base('INVOICE_OVERDUE', row.id),
		title: [
			`Invoice #${row.invoiceNumber} overdue`,
			...(audience === 'admin' ? [row.companyName ?? 'Unknown practice'] : []),
			...invoiceFor(row)
		].join(' · '),
		detail: `${amount} · ${plural(late, 'day')} past due`,
		since: row.dueDate ?? row.createdAt,
		dueAt: row.dueDate,
		href: `/invoices/${row.id}`,
		location: row.locationName ?? null,
		action: audience === 'admin' ? { label: 'View invoice', href: `/invoices/${row.id}` } : payAction(row)
	};
}

export function dueInvoiceItem(row: InvoiceRow, now: Date = new Date()): AttentionItem {
	const inDays = row.dueDate ? -daysPast(row.dueDate, now) : null;
	const when = inDays === null ? 'no due date' : inDays === 0 ? 'due today' : `due in ${plural(inDays, 'day')}`;
	return {
		...base('INVOICE_DUE', row.id),
		title: [`Invoice #${row.invoiceNumber}`, ...invoiceFor(row)].join(' · '),
		detail: `${formatMoney(Number(row.amountRemaining ?? 0))} · ${when}`,
		since: row.createdAt,
		dueAt: row.dueDate,
		href: `/invoices/${row.id}`,
		location: row.locationName ?? null,
		action: payAction(row)
	};
}

export type UnbilledRow = {
	id: number;
	disciplineName: string | null;
	companyName: string | null;
	/** When it moved to PAYMENT_REQUIRED (best available: updated_at). */
	since: Date;
};

export function unbilledPlacementItem(row: UnbilledRow, now: Date = new Date()): AttentionItem {
	return {
		...base('PERM_UNBILLED', String(row.id)),
		title: `Unbilled placement · ${row.disciplineName ?? 'Permanent'} · ${row.companyName ?? 'Unknown practice'}`,
		detail: `Hired ${formatAge(row.since, now)} ago · no invoice raised`,
		since: row.since,
		href: `/requisitions/${row.id}`,
		action: { label: 'Create invoice', href: `/requisitions/${row.id}?tab=invoices`, hint: ACTION_HINTS.createInvoice }
	};
}

// --- People ------------------------------------------------------------------

export type PermApplicantsRow = {
	requisitionId: number;
	disciplineName: string | null;
	companyName: string | null;
	locationName: string | null;
	waiting: number;
	oldest: Date;
};

export function permApplicantsItem(row: PermApplicantsRow, audience: Audience, now: Date = new Date()): AttentionItem {
	const who = plural(row.waiting, 'applicant');
	const role = `${row.disciplineName ?? 'Position'} (permanent)`;
	return {
		...base('PERM_APPLICANTS_WAITING', String(row.requisitionId)),
		title: audience === 'admin' ? `${who} waiting · ${role}` : `${who} for ${role}`,
		detail:
			audience === 'admin'
				? `${row.companyName ?? 'Unknown practice'} · oldest ${formatAge(row.oldest, now)}`
				: `Oldest applied ${formatAge(row.oldest, now)} ago`,
		since: row.oldest,
		href: `/requisitions/${row.requisitionId}`,
		location: row.locationName,
		action: {
			label: audience === 'admin' ? 'Review applicants' : 'View applicants',
			href: `/requisitions/${row.requisitionId}?tab=applications`
		}
	};
}

export type PendingProfessionalRow = {
	id: string;
	firstName: string | null;
	lastName: string | null;
	createdAt: Date;
	disciplines: string | null;
};

export function pendingProfessionalItem(row: PendingProfessionalRow, now: Date = new Date()): AttentionItem {
	return {
		...base('PRO_PENDING_APPROVAL', row.id),
		title: `Professional awaiting approval · ${shortName(row.firstName, row.lastName)}`,
		detail: [row.disciplines, `signed up ${formatAge(row.createdAt, now)} ago`].filter(Boolean).join(' · '),
		since: row.createdAt,
		href: `/professionals/${row.id}`,
		action: { label: 'Review profile', href: `/professionals/${row.id}` }
	};
}

export type PendingClientRow = {
	id: string;
	companyName: string | null;
	firstName: string | null;
	lastName: string | null;
	createdAt: Date;
};

export function pendingClientItem(row: PendingClientRow, now: Date = new Date()): AttentionItem {
	return {
		...base('CLIENT_PENDING_APPROVAL', row.id),
		title: `Practice awaiting approval · ${row.companyName ?? 'Unnamed practice'}`,
		detail: `${shortName(row.firstName, row.lastName)} · signed up ${formatAge(row.createdAt, now)} ago`,
		since: row.createdAt,
		href: `/clients/${row.id}`,
		action: { label: 'Review practice', href: `/clients/${row.id}` }
	};
}

export type ComplianceQueueRow = {
	subjectId: string;
	subjectName: string;
	ruleKey: string;
	severity: 'CRITICAL' | 'BLOCKED';
	title: string;
	detail: string;
	dueOn: string | null;
	upcomingShiftCount: number;
	remindable: boolean;
	remindedAt: string | null;
};

export function complianceItem(row: ComplianceQueueRow, now: Date = new Date()): AttentionItem {
	const kind = row.severity === 'CRITICAL' ? 'COMPLIANCE_CRITICAL' : 'COMPLIANCE_BLOCKED';
	const booked = row.upcomingShiftCount ? ` · booked on ${plural(row.upcomingShiftCount, 'upcoming shift')}` : '';
	const since = row.dueOn ? new Date(`${row.dueOn}T12:00:00Z`) : now;
	const item: AttentionItem = {
		...base(kind, `${row.subjectId}:${row.ruleKey}`),
		title: `${row.subjectName} · ${row.title}`,
		detail: `${row.detail}${booked}`,
		since,
		href: `/professionals/${row.subjectId}`,
		action: { label: 'Review', href: `/professionals/${row.subjectId}` },
		secondary: { label: 'Compliance', href: `/admin/compliance?severity=${row.severity}` }
	};
	if (row.remindable && row.remindedAt) {
		item.action = {
			label: 'Reminded',
			disabledReason: `Reminded ${formatAge(new Date(row.remindedAt), now)} ago. You can send another tomorrow.`
		};
	} else if (row.remindable) {
		item.action = {
			label: 'Remind',
			hint: ACTION_HINTS.remind,
			form: {
				action: '/admin/compliance?/sendReminder',
				fields: { candidateId: row.subjectId, ruleKey: row.ruleKey }
			}
		};
	}
	return item;
}

export type SupportRow = {
	id: string;
	ticketNumber: number;
	title: string;
	status: string | null;
	reporterFirstName: string | null;
	reporterLastName: string | null;
	updatedAt: Date;
	createdAt: Date;
};

export function supportItem(row: SupportRow): AttentionItem {
	return {
		...base('SUPPORT_OPEN', row.id),
		title: `Support · ${row.title}`,
		detail: `Ticket #${row.ticketNumber} · ${shortName(row.reporterFirstName, row.reporterLastName)}${row.status === 'NEW' ? ' · new' : ''}`,
		since: row.createdAt,
		href: `/support/ticket/${row.id}`,
		action: { label: 'Open ticket', href: `/support/ticket/${row.id}` }
	};
}

// --- Practice-only -------------------------------------------------------------

export type SignatureRow = { id: string; title: string; signingUrl: string };

export function signatureItem(row: SignatureRow, now: Date = new Date()): AttentionItem {
	return {
		...base('SIGNATURE_PENDING', row.id),
		title: `Sign your ${row.title}`,
		detail: 'It only takes a couple of minutes.',
		since: now,
		href: row.signingUrl,
		action: { label: 'Review & sign', href: row.signingUrl, external: true }
	};
}

export type StaffNoLocationRow = {
	id: string;
	firstName: string | null;
	lastName: string | null;
	createdAt: Date;
};

export function staffNoLocationItem(row: StaffNoLocationRow): AttentionItem {
	return {
		...base('STAFF_NO_LOCATION', row.id),
		title: `${shortName(row.firstName, row.lastName)} isn't assigned to a location`,
		detail: "They can't see any shifts or timesheets until you add one.",
		since: row.createdAt,
		href: '/team',
		action: { label: 'Assign location', href: '/team' }
	};
}
