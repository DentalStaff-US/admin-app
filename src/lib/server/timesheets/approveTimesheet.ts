import db from '$lib/server/database/drizzle';
import { adminConfigTable } from '$lib/server/database/schemas/config';
import type {
	TimesheetExpenseSelect,
	TimeSheetSelect
} from '$lib/server/database/schemas/requisition';
import {
	approveTimesheet as approveTimesheetStatus,
	computeHoursBreakdown,
	createInvoiceRecord,
	createPaperInvoiceRecord,
	getApprovedBilledHoursForWeek,
	getRequisitionById,
	getTimesheetById,
	getUnfinishedWorkdaysForTimesheet,
	listTimesheetExpenses,
	revertTimesheetToPending
} from '$lib/server/database/queries/requisitions';
import { getCandidateProfileById } from '$lib/server/database/queries/candidates';
import { getClientProfileById, getClientSubscription } from '$lib/server/database/queries/clients';
import { getDisciplineById } from '$lib/server/database/queries/disciplines';
import { createStripeInvoice, withCardProcessingFee } from '$lib/server/stripe';
import { writeActionHistory } from '$lib/server/database/queries/admin';
import { logger } from '$lib/server/logger';

const ADMIN_FEE_LINE_DESCRIPTION = 'Administration Fees';
const OVERTIME_LINE_DESCRIPTION = 'Overtime hours (1.5×)';

/**
 * A robust, human-readable description for timesheet-generated invoices (used on
 * both paper PDFs and Stripe invoices). It identifies the work (professional,
 * client, requisition, timesheet) AND explains the charges (regular vs overtime
 * hours, admin fee, card processing fee) so a client can audit the invoice at a
 * glance — the line-item amounts still live in the itemized table.
 */
export function buildTimesheetInvoiceDescription(params: {
	candidateName: string;
	companyName: string | null;
	requisitionId: number | null;
	timesheetId: string;
	regularHours: number;
	overtimeHours: number;
	hasAdminFee: boolean;
	hasProcessingFee: boolean;
	// Discipline the work was billed under, e.g. "Dental Hygienist" / "RDH".
	// Optional so a missing discipline drops the line instead of blocking billing.
	disciplineName?: string | null;
	disciplineAbbreviation?: string | null;
}): string {
	const fmtHrs = (h: number) => (Number.isInteger(h) ? String(h) : Number(h.toFixed(2)).toString());

	// "Dental Hygienist (RDH)" when both are known; whichever one exists otherwise.
	const disciplineLabel = params.disciplineName
		? params.disciplineAbbreviation
			? `${params.disciplineName} (${params.disciplineAbbreviation})`
			: params.disciplineName
		: (params.disciplineAbbreviation ?? null);

	// One field per line so the invoice memo is legible on the Stripe hosted page,
	// the paper PDF, and our in-app view (all preserve newlines). Sections are
	// separated by a blank line; charges are bulleted.
	const idLines = [
		`Professional: ${params.candidateName}`,
		disciplineLabel ? `Discipline: ${disciplineLabel}` : null,
		params.companyName ? `Client: ${params.companyName}` : null,
		params.requisitionId != null ? `Requisition #${params.requisitionId}` : null,
		`Timesheet #${params.timesheetId}`
	].filter(Boolean);

	const chargeLines = [
		params.regularHours > 0 ? `${fmtHrs(params.regularHours)} regular hrs (first 40)` : null,
		params.overtimeHours > 0 ? `${fmtHrs(params.overtimeHours)} overtime hrs at 1.5×` : null,
		params.hasAdminFee ? 'Administration fee on regular hours' : null,
		params.hasProcessingFee ? 'Card processing fee (3%)' : null
	].filter(Boolean);

	const sections = ['Dental Temp Staffing Solutions — Timesheet Invoice', idLines.join('\n')];
	if (chargeLines.length) {
		sections.push('Charges:\n' + chargeLines.map((c) => `\u2022 ${c}`).join('\n'));
	}
	return sections.join('\n\n');
}

// When a week is split across timesheets, explain on the invoice why these hours
// are overtime (the week's 40h regular allotment was already used on a prior
// timesheet).
function overtimeLineDescription(priorWeekHours: number): string {
	return priorWeekHours > 0
		? `${OVERTIME_LINE_DESCRIPTION} — week already at ${priorWeekHours.toFixed(2)} hrs on a prior timesheet`
		: OVERTIME_LINE_DESCRIPTION;
}

// Admin fee is charged on REGULAR hours only — overtime is exempt. Callers pass
// `regularCents` (not the full billable amount) here.
export function calculateAdminFeeCents(
	regularCents: number,
	adminFee: number,
	adminFeeType: 'PERCENTAGE' | 'FIXED'
): number {
	if (!adminFee || adminFee <= 0) return 0;
	if (adminFeeType === 'PERCENTAGE') {
		return Math.round((regularCents * adminFee) / 100);
	}
	return Math.round(adminFee * 100);
}

export type StripeLineItem = {
	amountInCents: number;
	description: string;
	// When set, the item bills as `quantity × unitAmountInCents` (hours × rate)
	// instead of a single lump `amount`. Hours can be fractional — see the
	// `quantity_decimal` handling in createStripeInvoice.
	quantity?: number;
	unitAmountInCents?: number;
};

export function buildStripeLineItems({
	regularHours,
	regularCents,
	overtimeCents,
	overtimeHours,
	effectiveRateDollars,
	adminFeeCents,
	hoursDescription,
	expenses,
	priorWeekHours = 0
}: {
	regularHours: number;
	regularCents: number;
	overtimeCents: number;
	overtimeHours: number;
	effectiveRateDollars: number;
	adminFeeCents: number;
	hoursDescription: string;
	expenses: TimesheetExpenseSelect[];
	priorWeekHours?: number;
}) {
	// Mirror the paper invoice: hours are the quantity, the hourly rate is the
	// unit price (overtime at 1.5×). Rate is integer dollars, so rateCents is an
	// exact multiple of 100 and `unit_amount × quantity_decimal` reproduces the
	// same total computeHoursBreakdown already rounded to.
	const rateCents = Math.round(effectiveRateDollars * 100);
	const overtimeRateCents = Math.round(effectiveRateDollars * 1.5 * 100);

	const lineItems: StripeLineItem[] = [];
	// Skip the regular line entirely when this timesheet is all overtime (the
	// week's 40h was already used on a prior sheet) — no $0 "Regular hours" line.
	if (regularHours > 0) {
		lineItems.push({
			amountInCents: regularCents,
			description: hoursDescription,
			quantity: regularHours,
			unitAmountInCents: rateCents
		});
	}
	if (overtimeHours > 0 && overtimeCents > 0) {
		lineItems.push({
			amountInCents: overtimeCents,
			description: overtimeLineDescription(priorWeekHours),
			quantity: overtimeHours,
			unitAmountInCents: overtimeRateCents
		});
	}
	// Expenses and the admin fee are single-unit charges — no quantity/rate split.
	for (const expense of expenses) {
		lineItems.push({
			amountInCents: expense.amountCents,
			description: `Expense: ${expense.description}`
		});
	}
	if (adminFeeCents > 0) {
		lineItems.push({ amountInCents: adminFeeCents, description: ADMIN_FEE_LINE_DESCRIPTION });
	}
	// The card-processing surcharge is appended later by withCardProcessingFee
	// (only for card-paying clients), so it isn't part of the base line items.
	return lineItems;
}

export function buildPaperLineItems({
	regularHours,
	overtimeHours,
	regularCents,
	overtimeCents,
	effectiveRateDollars,
	adminFeeCents,
	hoursDescription,
	expenses,
	priorWeekHours = 0
}: {
	regularHours: number;
	overtimeHours: number;
	regularCents: number;
	overtimeCents: number;
	effectiveRateDollars: number;
	adminFeeCents: number;
	hoursDescription: string;
	expenses: TimesheetExpenseSelect[];
	priorWeekHours?: number;
}) {
	const rateCents = Math.round(effectiveRateDollars * 100);
	const overtimeRateCents = Math.round(effectiveRateDollars * 1.5 * 100);
	const items: Array<{
		id: string;
		description: string;
		quantity: number;
		rate: number;
		unit_amount: number;
		unit_amount_excluding_tax: number;
		amount: number;
		currency: string;
		type: 'paper';
	}> = [];
	// Skip the regular line when this timesheet is all overtime (week's 40h
	// already used on a prior sheet).
	if (regularHours > 0) {
		items.push({
			id: crypto.randomUUID(),
			description: hoursDescription,
			quantity: regularHours,
			rate: rateCents,
			unit_amount: rateCents,
			unit_amount_excluding_tax: rateCents,
			amount: regularCents,
			currency: 'usd',
			type: 'paper'
		});
	}
	if (overtimeHours > 0 && overtimeCents > 0) {
		items.push({
			id: crypto.randomUUID(),
			description: overtimeLineDescription(priorWeekHours),
			quantity: overtimeHours,
			rate: overtimeRateCents,
			unit_amount: overtimeRateCents,
			unit_amount_excluding_tax: overtimeRateCents,
			amount: overtimeCents,
			currency: 'usd',
			type: 'paper' as const
		});
	}
	for (const expense of expenses) {
		items.push({
			id: crypto.randomUUID(),
			description: `Expense: ${expense.description}`,
			quantity: 1,
			rate: expense.amountCents,
			unit_amount: expense.amountCents,
			unit_amount_excluding_tax: expense.amountCents,
			amount: expense.amountCents,
			currency: 'usd',
			type: 'paper' as const
		});
	}
	if (adminFeeCents > 0) {
		items.push({
			id: crypto.randomUUID(),
			description: ADMIN_FEE_LINE_DESCRIPTION,
			quantity: 1,
			rate: adminFeeCents,
			unit_amount: adminFeeCents,
			unit_amount_excluding_tax: adminFeeCents,
			amount: adminFeeCents,
			currency: 'usd',
			type: 'paper' as const
		});
	}
	return items;
}

export type ApproveTimesheetResult =
	| { ok: true; timesheet: TimeSheetSelect }
	| {
			ok: false;
			reason:
				| 'PENDING_EXPENSES'
				| 'NOT_FOUND'
				| 'NOT_PENDING'
				| 'UNFINISHED_WORKDAYS'
				| 'ZERO_AMOUNT'
				| 'NO_STRIPE_CUSTOMER'
				| 'ERROR';
			pendingExpenseCount?: number;
			unfinishedCount?: number;
	  };

/**
 * Single source of truth for approving a timesheet and generating its invoice.
 * Used by the admin "Approve" action (actorUserId = the admin) and the 24h
 * auto-approval job (actorUserId = null, with `autoApproved` context).
 *
 * Enforces the same guards as the manual path: no PENDING expenses, the approval
 * gate (all assigned workdays for the week have ended), and a > $0 invoice.
 * Reverts the timesheet to PENDING on any failure after the status flip.
 */
export async function approveAndInvoiceTimesheet(
	timesheetId: string,
	opts: { actorUserId: string | null; autoApproved?: { submittedAt: Date } }
): Promise<ApproveTimesheetResult> {
	const { actorUserId } = opts;
	try {
		const [adminConfig] = await db.select().from(adminConfigTable).limit(1);

		const existingExpenses = await listTimesheetExpenses(timesheetId);
		const pendingExpenses = existingExpenses.filter((e) => e.status === 'PENDING');
		if (pendingExpenses.length > 0) {
			return { ok: false, reason: 'PENDING_EXPENSES', pendingExpenseCount: pendingExpenses.length };
		}

		// Approval gate: every shift LINKED TO THIS timesheet (non-cancelled) must
		// have ended before we bill. A shift added later lands on a new sheet
		// (APPROVED) or reopens this one to DRAFT (PENDING), so it no longer needs
		// to block approval by being counted here.
		const preApproval = await getTimesheetById(timesheetId);
		if (!preApproval) {
			return { ok: false, reason: 'NOT_FOUND' };
		}
		// Only a submitted sheet can be approved — never skip PENDING. A DRAFT must
		// be submitted first; an already-APPROVED/VOID sheet can't be re-approved.
		// (DISCREPANCY is allowed: admin can approve a flagged sheet directly.)
		if (preApproval.status !== 'PENDING' && preApproval.status !== 'DISCREPANCY') {
			return { ok: false, reason: 'NOT_PENDING' };
		}
		const unfinishedWorkdays = await getUnfinishedWorkdaysForTimesheet(preApproval.id);
		if (unfinishedWorkdays.length > 0) {
			return {
				ok: false,
				reason: 'UNFINISHED_WORKDAYS',
				unfinishedCount: unfinishedWorkdays.length
			};
		}

		const timesheet = await approveTimesheetStatus(timesheetId, actorUserId);
		const requisition = timesheet.requisitionId
			? await getRequisitionById(timesheet.requisitionId)
			: null;
		if (!requisition) {
			throw new Error('Requisition not found for timesheet');
		}

		const approvedExpenses = existingExpenses.filter((e) => e.status === 'APPROVED');
		const expensesTotalCents = approvedExpenses.reduce((sum, e) => sum + e.amountCents, 0);

		const effectiveRate = timesheet.adjustedHourlyRate ?? requisition.hourlyRate;

		// Overtime is per-week: continue the 40h regular allotment across any
		// APPROVED sibling timesheets for this candidate+requisition+week, so a
		// backfilled day on a new timesheet bills as overtime when the week is
		// already past 40h.
		const priorWeekHours = timesheet.requisitionId
			? await getApprovedBilledHoursForWeek({
					candidateId: timesheet.associatedCandidateId,
					requisitionId: timesheet.requisitionId,
					weekBeginDate: timesheet.weekBeginDate,
					excludeTimesheetId: timesheet.id
				})
			: 0;

		const breakdown = computeHoursBreakdown(
			timesheet.totalHoursWorked || 0,
			effectiveRate,
			priorWeekHours
		);
		const amountInCents = breakdown.billableCents;

		// Admin fee applies to regular hours only — overtime is exempt.
		const adminFeeCents = calculateAdminFeeCents(
			breakdown.regularCents,
			adminConfig.adminPaymentFee,
			adminConfig.adminPaymentFeeType
		);

		const finalAmt = Math.round(amountInCents + expensesTotalCents + adminFeeCents);
		if (finalAmt <= 0) {
			await revertTimesheetToPending(timesheetId, actorUserId);
			return { ok: false, reason: 'ZERO_AMOUNT' };
		}

		// Only ever put the candidate/professional's name on the invoice.
		const { candidate } = await getCandidateProfileById(timesheet.associatedCandidateId);
		const candidateName = `${candidate.user.firstName} ${candidate.user.lastName}`;

		// Requisition rows carry only `disciplineId`; the memo shows the pair.
		const discipline = await getDisciplineById(requisition.disciplineId);

		const clientProfile = await getClientProfileById(timesheet.associatedClientId);
		const isPaperBilling = clientProfile?.profile.clientInvoiceMethod === 'PAPER';

		if (isPaperBilling) {
			const effectiveRateDollars = effectiveRate ?? 0;
			await createPaperInvoiceRecord(
				{
					clientId: timesheet.associatedClientId,
					amountInDollars: (finalAmt / 100).toFixed(2),
					sourceType: 'timesheet',
					timesheetId: timesheet.id,
					requisitionId: timesheet.requisitionId ?? undefined,
					candidateId: timesheet.associatedCandidateId,
					description: buildTimesheetInvoiceDescription({
						candidateName,
						companyName: clientProfile?.company?.companyName ?? null,
						requisitionId: timesheet.requisitionId ?? null,
						timesheetId: timesheet.id,
						regularHours: breakdown.regularHours,
						overtimeHours: breakdown.overtimeHours,
						hasAdminFee: adminFeeCents > 0,
						hasProcessingFee: false,
						disciplineName: discipline?.name ?? null,
						disciplineAbbreviation: discipline?.abbreviation ?? null
					}),
					lineItems: buildPaperLineItems({
						regularHours: breakdown.regularHours,
						overtimeHours: breakdown.overtimeHours,
						regularCents: breakdown.regularCents,
						overtimeCents: breakdown.overtimeCents,
						effectiveRateDollars,
						adminFeeCents,
						hoursDescription: `Regular hours worked for ${candidateName}`,
						expenses: approvedExpenses,
						priorWeekHours
					})
				},
				actorUserId
			);
		} else {
			const stripeCustomerId = await getClientSubscription(timesheet.associatedClientId);
			if (!stripeCustomerId) {
				await revertTimesheetToPending(timesheetId, actorUserId);
				return { ok: false, reason: 'NO_STRIPE_CUSTOMER' };
			}

			const baseLineItems = buildStripeLineItems({
				regularHours: breakdown.regularHours,
				regularCents: breakdown.regularCents,
				overtimeCents: breakdown.overtimeCents,
				overtimeHours: breakdown.overtimeHours,
				effectiveRateDollars: effectiveRate ?? 0,
				adminFeeCents,
				hoursDescription: `Regular hours worked for ${candidateName}`,
				expenses: approvedExpenses,
				priorWeekHours
			});
			// Appends a card processing fee (3%) only for card-paying clients.
			const lineItems = await withCardProcessingFee(stripeCustomerId, baseLineItems);
			const hasProcessingFee = lineItems.length > baseLineItems.length;

			const stripeInvoice = await createStripeInvoice(
				stripeCustomerId,
				lineItems,
				{
					userId: actorUserId ?? 'system',
					timesheetId: timesheet.id,
					clientId: timesheet.associatedClientId
				},
				buildTimesheetInvoiceDescription({
					candidateName,
					companyName: clientProfile?.company?.companyName ?? null,
					requisitionId: timesheet.requisitionId ?? null,
					timesheetId: timesheet.id,
					regularHours: breakdown.regularHours,
					overtimeHours: breakdown.overtimeHours,
					hasAdminFee: adminFeeCents > 0,
					hasProcessingFee,
					disciplineName: discipline?.name ?? null,
					disciplineAbbreviation: discipline?.abbreviation ?? null
				})
			);

			await createInvoiceRecord(
				{
					clientId: timesheet.associatedClientId,
					timesheet,
					stripeInvoice,
					amountInDollars: (stripeInvoice.amount_due / 100).toFixed(2)
				},
				actorUserId
			);
		}

		// Explicit, unambiguous audit row for timed auto-approval (silence = consent),
		// separate from the status-flip row so the history shows *why* and that no
		// person took the action.
		if (opts.autoApproved) {
			await writeActionHistory({
				table: 'TIMESHEETS',
				userId: null,
				action: 'UPDATE',
				entityId: timesheetId,
				beforeState: preApproval,
				afterState: timesheet,
				metadata: {
					status: 'APPROVED',
					autoApproved: true,
					reason:
						'Client did not approve within the 24-hour window — auto-approved (silence = consent).',
					approvalWindowHours: 24,
					submittedAt: opts.autoApproved.submittedAt,
					autoApprovedAt: new Date()
				}
			});
		}

		return { ok: true, timesheet };
	} catch (err) {
		await revertTimesheetToPending(timesheetId, actorUserId);
		logger.error('approveAndInvoiceTimesheet failed', { error: err, timesheetId, actorUserId });
		return { ok: false, reason: 'ERROR' };
	}
}
