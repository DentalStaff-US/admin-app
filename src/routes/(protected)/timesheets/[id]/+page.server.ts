import { USER_ROLES } from '$lib/config/constants';
import { assertCanAccessLocation } from '$lib/server/scoping';
import {
	getClientProfileById,
	getClientProfileByStaffUserId,
	getClientProfilebyUserId,
	getClientSubscription
} from '$lib/server/database/queries/clients';
import {
	adminOverrideTimesheet,
	approveTimesheetExpense,
	computeHoursBreakdown,
	createInvoiceRecord,
	createTimesheetExpense,
	getApprovedBilledHoursForWeek,
	deleteTimesheet,
	deleteTimesheetExpense,
	getInvoiceByTimesheetId,
	getRecurrenceDaysForTimesheet,
	getRequisitionById,
	getRequisitionDetailsById,
	getRequisitionDetailsByIdAdmin,
	getTimesheetById,
	getTimesheetDetails,
	getTimesheetDetailsAdmin,
	getTimesheetExpenseById,
	getUnfinishedWorkdaysForTimesheet,
	getUnstartedWorkdaysForTimesheet,
	getWorkdaysForTimesheet,
	listTimesheetExpenses,
	rejectTimesheet,
	rejectTimesheetExpense,
	revertTimesheetToPending,
	updateTimesheetExpense,
	voidTimesheetWithInvoice,
	createPaperInvoiceRecord
} from '$lib/server/database/queries/requisitions';
import { getCandidateProfileById } from '$lib/server/database/queries/candidates';
import { addCandidateToBlacklist } from '$lib/server/database/queries/blacklist';
import {
	approveAndInvoiceTimesheet,
	buildPaperLineItems,
	buildStripeLineItems,
	calculateAdminFeeCents,
	buildTimesheetInvoiceDescription
} from '$lib/server/timesheets/approveTimesheet';
import { getDisciplineById } from '$lib/server/database/queries/disciplines';
import type { TimesheetExpenseSelect } from '$lib/server/database/schemas/requisition';
import { error, fail, redirect } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import { setFlash } from 'sveltekit-flash-message/server';
import { createStripeInvoice, withCardProcessingFee } from '$lib/server/stripe';
import { logger } from '$lib/server/logger';
import db from '$lib/server/database/drizzle';
import { desc, eq } from 'drizzle-orm';
import { adminConfigTable } from '$lib/server/database/schemas/config';
import { actionHistoryTable } from '$lib/server/database/schemas/admin';
import { redirectIfNotValidCustomer } from '$lib/server/database/queries/billing';
import { getUserById } from '$lib/server/database/queries/users';
import { timeSheetTable } from '$lib/server/database/schemas/requisition';
import { createUTCDateTime } from '$lib/_helpers/UTCTimezoneUtils';
import type { RawTimesheetHours } from '$lib/server/database/schemas/requisition';
import { writeActionHistory } from '$lib/server/database/queries/admin';
import { notifyInvoiceCreated, notifyTimesheetSubmitted } from '$lib/server/notifications/transactional';
import { resolveBillingRecipient } from '$lib/server/billing/recipients';
import { voidInvoiceAndNotify } from '$lib/server/invoices/voidNotify';
import { superValidate } from 'sveltekit-superforms/server';
import { addExpenseSchema } from '$lib/config/zod-schemas';

export const load = async (event: RequestEvent) => {
	const user = event.locals.user;
	if (!user) {
		redirect(302, '/auth/sign-in');
	}

	const { id } = event.params;

	const [adminConfig] = await db.select().from(adminConfigTable).limit(1);
	const adminFeeSettings = {
		amount: adminConfig?.adminPaymentFee ?? 0,
		type: (adminConfig?.adminPaymentFeeType ?? 'PERCENTAGE') as 'PERCENTAGE' | 'FIXED'
	};

	const addExpenseForm = await superValidate(addExpenseSchema);

	// Approval gate (UI): block the Approve button while any shift LINKED TO THIS
	// timesheet has not yet ended. A sheet is submittable/approvable once its own
	// last linked shift ends — not once the whole calendar week is over. Same
	// check the submit/approve actions enforce server-side.
	const rawTimesheet = await getTimesheetById(id);
	const unfinishedWorkdays = rawTimesheet ? await getUnfinishedWorkdaysForTimesheet(id) : [];
	const hasUnfinishedWorkdays = unfinishedWorkdays.length > 0;
	const unfinishedWorkdayCount = unfinishedWorkdays.length;

	// Hours already billed on EARLIER timesheets for this candidate's week, so the
	// billing-summary preview continues the weekly overtime split instead of
	// restarting at 40 on a secondary (split-week) timesheet. `createdBefore`
	// keeps an approved sheet's displayed split stable (it doesn't shift when a
	// later sibling is approved).
	const priorWeekHours =
		rawTimesheet && rawTimesheet.requisitionId
			? await getApprovedBilledHoursForWeek({
					candidateId: rawTimesheet.associatedCandidateId,
					requisitionId: rawTimesheet.requisitionId,
					weekBeginDate: rawTimesheet.weekBeginDate,
					excludeTimesheetId: rawTimesheet.id,
					createdBefore: rawTimesheet.createdAt
				})
			: 0;

	if (user.role === USER_ROLES.SUPERADMIN) {
		const timesheet = await getTimesheetDetailsAdmin(id);
		const requisition = await getRequisitionDetailsByIdAdmin(timesheet.requisitionId);
		const recurrenceDays = await getRecurrenceDaysForTimesheet(timesheet);
		const workdays = await getWorkdaysForTimesheet(timesheet);
		const invoice = await getInvoiceByTimesheetId(id);
		const expenses = await listTimesheetExpenses(id);
		const auditHistoryRaw = await db
			.select()
			.from(actionHistoryTable)
			.where(eq(actionHistoryTable.entityId, id))
			.orderBy(desc(actionHistoryTable.createdAt));

		const auditHistory = await Promise.allSettled(
			auditHistoryRaw.map(async (history) => {
				const user = await getUserById(history.userId);
				return { ...history, user: user?.user || null };
			})
		);

		return {
			user,
			timesheet,
			workdays,
			recurrenceDays,
			requisition: requisition.requisition,
			invoice,
			expenses,
			adminFeeSettings,
			addExpenseForm,
			hasUnfinishedWorkdays,
			unfinishedWorkdayCount,
			priorWeekHours,
			auditHistory: auditHistory.map((h) => h.status === 'fulfilled' && h.value)
		};
	}

	if (user.role === USER_ROLES.CLIENT) {
		if (!user.completedOnboarding) {
			redirect(302, '/onboarding/client/company');
		}
		const client = await getClientProfilebyUserId(user.id);
		await redirectIfNotValidCustomer(client.id, user.role);

		const timesheet = await getTimesheetDetails(id, client.id);
		const requisition = await getRequisitionDetailsById(timesheet.requisitionId);
		const recurrenceDays = await getRecurrenceDaysForTimesheet(timesheet);
		const workdays = await getWorkdaysForTimesheet(timesheet);
		const invoice = await getInvoiceByTimesheetId(id);
		const expenses = await listTimesheetExpenses(id);

		return {
			user,
			timesheet,
			workdays,
			recurrenceDays,
			requisition: requisition.requisition,
			invoice,
			expenses,
			adminFeeSettings,
			addExpenseForm,
			hasUnfinishedWorkdays,
			unfinishedWorkdayCount,
			priorWeekHours
		};
	}

	if (user.role === USER_ROLES.CLIENT_STAFF) {
		const client = await getClientProfileByStaffUserId(user.id);
		await redirectIfNotValidCustomer(client?.id, user.role);

		const timesheet = await getTimesheetDetails(id, client?.id);
		const requisition = await getRequisitionDetailsById(timesheet.requisitionId);
		// Access guard: scoped staff must own the requisition's location.
		await assertCanAccessLocation(user, requisition?.requisition?.location?.id);
		const recurrenceDays = await getRecurrenceDaysForTimesheet(timesheet);
		const workdays = await getWorkdaysForTimesheet(timesheet);
		const invoice = await getInvoiceByTimesheetId(id);
		const expenses = await listTimesheetExpenses(id);

		return {
			user,
			timesheet,
			workdays,
			recurrenceDays,
			requisition: requisition.requisition,
			invoice,
			expenses,
			adminFeeSettings,
			addExpenseForm,
			hasUnfinishedWorkdays,
			unfinishedWorkdayCount,
			priorWeekHours
		};
	}

	return {
		user,
		timesheet: null,
		workdays: [],
		recurrenceDays: [],
		discrepancies: [],
		expenses: [] as TimesheetExpenseSelect[],
		adminFeeSettings,
		addExpenseForm
	};
};

export const actions = {
	// Set adjusted hourly rate on the workday associated with this timesheet
	setAdjustedHourlyRate: async (event: RequestEvent) => {
		const { user } = event.locals;
		const { id } = event.params;

		if (!user || user.role !== USER_ROLES.SUPERADMIN) {
			return fail(403, { error: 'Only admins can adjust the hourly rate' });
		}

		const formData = await event.request.formData();
		const rawRate = formData.get('adjustedHourlyRate') as string;

		const adjustedHourlyRate = rawRate !== '' && rawRate !== null ? parseInt(rawRate, 10) : null;

		if (adjustedHourlyRate !== null && (isNaN(adjustedHourlyRate) || adjustedHourlyRate < 0)) {
			return fail(400, { error: 'Invalid hourly rate' });
		}

		try {
			await db
				.update(timeSheetTable)
				.set({ adjustedHourlyRate, updatedAt: new Date() })
				.where(eq(timeSheetTable.id, id));

			setFlash({ type: 'success', message: 'Hourly rate updated successfully' }, event);
			return { success: true };
		} catch (err) {
			console.error('Error updating adjusted hourly rate:', err);
			setFlash({ type: 'error', message: 'Failed to update hourly rate' }, event);
			return fail(500, { error: 'Failed to update hourly rate' });
		}
	},
	adminSubmitTimesheet: async (event: RequestEvent) => {
		const { id } = event.params;
		const { user } = event.locals;

		if (!user || user.role !== USER_ROLES.SUPERADMIN) {
			throw error(401, 'Unauthorized');
		}

		const formData = await event.request.formData();
		const entries = JSON.parse(formData.get('entries') as string);
		const totalHours = parseFloat(formData.get('totalHours') as string);

		try {
			const [timesheet] = await db
				.select()
				.from(timeSheetTable)
				.where(eq(timeSheetTable.id, id))
				.limit(1);

			if (!timesheet) {
				throw error(404, 'Timesheet not found');
			}

			// Approved/void timesheets are locked — no edits. Corrections require a
			// Void (which regenerates a fresh DRAFT).
			if (timesheet.status === 'APPROVED' || timesheet.status === 'VOID') {
				setFlash(
					{
						type: 'error',
						message: `This timesheet is ${timesheet.status.toLowerCase()} and can no longer be edited. Void it to make corrections.`
					},
					event
				);
				return fail(409, { error: 'Timesheet is locked' });
			}

			// A sheet can be sent for approval once the work is underway: every shift
			// linked to this timesheet must have STARTED first (the approval/billing
			// gate still requires them to have ended). Draft saves are exempt.
			const unstartedWorkdays = await getUnstartedWorkdaysForTimesheet(timesheet.id);
			if (unstartedWorkdays.length > 0) {
				setFlash(
					{
						type: 'error',
						message: `Cannot submit yet: ${unstartedWorkdays.length} shift(s) on this timesheet have not started.`
					},
					event
				);
				return fail(400, {
					error: 'All shifts on this timesheet must start before submitting'
				});
			}

			const requisition = await getRequisitionById(timesheet.requisitionId);

			if (!requisition || !requisition.referenceTimezone) {
				throw error(400, 'Requisition timezone not found');
			}

			const entriesArray = Object.entries(entries)
				.filter(([_, value]: [string, any]) => value.hours > 0)
				.map(([date, value]: [string, any]) => ({
					date,
					// Stable key sent by the client (workdayIdByDate) — persisted so
					// removal paths can strip exactly this day. See RawTimesheetHours.
					workdayId: value.workdayId || '',
					startTime: value.startTime,
					endTime: value.endTime,
					lunchStartTime: value.lunchStartTime,
					lunchEndTime: value.lunchEndTime,
					hours: value.hours
				}))
				// Drop any row whose workday didn't resolve rather than writing an
				// orphaned (un-strippable) hours_raw entry.
				.filter((entry) => entry.workdayId);

			// createUTCDateTime returns Date objects; Drizzle's JSON column serializes
			// them to ISO strings on write, matching RawTimesheetHours (typed as
			// strings). Cast through unknown to satisfy the static type.
			const formattedEntries = entriesArray.map((entry) => ({
				...entry,
				startTime: createUTCDateTime(entry.date, entry.startTime, requisition.referenceTimezone),
				endTime: createUTCDateTime(entry.date, entry.endTime, requisition.referenceTimezone),
				lunchStartTime: entry.lunchStartTime
					? createUTCDateTime(entry.date, entry.lunchStartTime, requisition.referenceTimezone)
					: null,
				lunchEndTime: entry.lunchEndTime
					? createUTCDateTime(entry.date, entry.lunchEndTime, requisition.referenceTimezone)
					: null
			})) as unknown as RawTimesheetHours[];

			const [result] = await db
				.update(timeSheetTable)
				.set({
					totalHoursWorked: totalHours.toString(),
					hoursRaw: formattedEntries,
					status: 'PENDING',
					submittedAt: new Date(),
					updatedAt: new Date()
				})
				.where(eq(timeSheetTable.id, id))
				.returning();

			await writeActionHistory({
				action: 'UPDATE',
				userId: user.id,
				entityId: result.id,
				table: 'TIMESHEETS',
				beforeState: timesheet,
				afterState: result
			});

			await notifyTimesheetSubmitted(result.id);

			setFlash({ type: 'success', message: 'Timesheet submitted successfully!' }, event);
			return { success: true };
		} catch (err) {
			console.error('Error submitting timesheet:', err);
			setFlash({ type: 'error', message: 'Failed to submit timesheet' }, event);
			return fail(500, { error: 'Failed to submit timesheet' });
		}
	},

	// Admin saves entered hours on behalf of the professional WITHOUT submitting:
	// the sheet stays DRAFT and the client is NOT notified. Lets an admin record
	// e.g. a backfilled day now and submit later.
	adminSaveDraftTimesheet: async (event: RequestEvent) => {
		const { id } = event.params;
		const { user } = event.locals;

		if (!user || user.role !== USER_ROLES.SUPERADMIN) {
			throw error(401, 'Unauthorized');
		}

		const formData = await event.request.formData();
		const entries = JSON.parse(formData.get('entries') as string);
		const totalHours = parseFloat(formData.get('totalHours') as string);

		try {
			const [timesheet] = await db
				.select()
				.from(timeSheetTable)
				.where(eq(timeSheetTable.id, id))
				.limit(1);

			if (!timesheet) {
				throw error(404, 'Timesheet not found');
			}

			// Approved/void timesheets are locked — no edits.
			if (timesheet.status === 'APPROVED' || timesheet.status === 'VOID') {
				setFlash(
					{
						type: 'error',
						message: `This timesheet is ${timesheet.status.toLowerCase()} and can no longer be edited. Void it to make corrections.`
					},
					event
				);
				return fail(409, { error: 'Timesheet is locked' });
			}

			const requisition = await getRequisitionById(timesheet.requisitionId);

			if (!requisition || !requisition.referenceTimezone) {
				throw error(400, 'Requisition timezone not found');
			}

			const entriesArray = Object.entries(entries)
				.filter(([_, value]: [string, any]) => value.hours > 0)
				.map(([date, value]: [string, any]) => ({
					date,
					// Stable key sent by the client (workdayIdByDate) — persisted so
					// removal paths can strip exactly this day. See RawTimesheetHours.
					workdayId: value.workdayId || '',
					startTime: value.startTime,
					endTime: value.endTime,
					lunchStartTime: value.lunchStartTime,
					lunchEndTime: value.lunchEndTime,
					hours: value.hours
				}))
				// Drop any row whose workday didn't resolve rather than writing an
				// orphaned (un-strippable) hours_raw entry.
				.filter((entry) => entry.workdayId);

			// createUTCDateTime returns Date objects; Drizzle's JSON column serializes
			// them to ISO strings on write, matching RawTimesheetHours (typed as
			// strings). Cast through unknown to satisfy the static type.
			const formattedEntries = entriesArray.map((entry) => ({
				...entry,
				startTime: createUTCDateTime(entry.date, entry.startTime, requisition.referenceTimezone),
				endTime: createUTCDateTime(entry.date, entry.endTime, requisition.referenceTimezone),
				lunchStartTime: entry.lunchStartTime
					? createUTCDateTime(entry.date, entry.lunchStartTime, requisition.referenceTimezone)
					: null,
				lunchEndTime: entry.lunchEndTime
					? createUTCDateTime(entry.date, entry.lunchEndTime, requisition.referenceTimezone)
					: null
			})) as unknown as RawTimesheetHours[];

			const [result] = await db
				.update(timeSheetTable)
				.set({
					totalHoursWorked: totalHours.toString(),
					hoursRaw: formattedEntries,
					// Keep/return to DRAFT — this is a save, not a submission.
					status: 'DRAFT',
					updatedAt: new Date()
				})
				.where(eq(timeSheetTable.id, id))
				.returning();

			await writeActionHistory({
				action: 'UPDATE',
				userId: user.id,
				entityId: result.id,
				table: 'TIMESHEETS',
				beforeState: timesheet,
				afterState: result,
				metadata: { editType: 'ADMIN_SAVE_DRAFT' }
			});

			setFlash({ type: 'success', message: 'Draft saved' }, event);
			return { success: true };
		} catch (err) {
			console.error('Error saving timesheet draft:', err);
			setFlash({ type: 'error', message: 'Failed to save draft' }, event);
			return fail(500, { error: 'Failed to save draft' });
		}
	},

	adminResubmitTimesheet: async (event: RequestEvent) => {
		const { id } = event.params;
		const { user } = event.locals;

		if (!user || user.role !== USER_ROLES.SUPERADMIN) {
			throw error(401, 'Unauthorized');
		}

		const formData = await event.request.formData();
		const entries = JSON.parse(formData.get('entries') as string);
		const totalHours = parseFloat(formData.get('totalHours') as string);

		try {
			const [timesheet] = await db
				.select()
				.from(timeSheetTable)
				.where(eq(timeSheetTable.id, id))
				.limit(1);

			if (!timesheet) {
				throw error(404, 'Timesheet not found');
			}

			// Approved/void timesheets are locked — no edits. Corrections require a
			// Void (which regenerates a fresh DRAFT).
			if (timesheet.status === 'APPROVED' || timesheet.status === 'VOID') {
				setFlash(
					{
						type: 'error',
						message: `This timesheet is ${timesheet.status.toLowerCase()} and can no longer be edited. Void it to make corrections.`
					},
					event
				);
				return fail(409, { error: 'Timesheet is locked' });
			}

			// A sheet can be sent for approval once the work is underway: every shift
			// linked to this timesheet must have STARTED first (the approval/billing
			// gate still requires them to have ended). Draft saves are exempt.
			const unstartedWorkdays = await getUnstartedWorkdaysForTimesheet(timesheet.id);
			if (unstartedWorkdays.length > 0) {
				setFlash(
					{
						type: 'error',
						message: `Cannot submit yet: ${unstartedWorkdays.length} shift(s) on this timesheet have not started.`
					},
					event
				);
				return fail(400, {
					error: 'All shifts on this timesheet must start before submitting'
				});
			}

			const requisition = await getRequisitionById(timesheet.requisitionId);

			if (!requisition || !requisition.referenceTimezone) {
				throw error(400, 'Requisition timezone not found');
			}

			const entriesArray = Object.entries(entries)
				.filter(([_, value]: [string, any]) => value.hours > 0)
				.map(([date, value]: [string, any]) => ({
					date,
					// Stable key sent by the client (workdayIdByDate) — persisted so
					// removal paths can strip exactly this day. See RawTimesheetHours.
					workdayId: value.workdayId || '',
					startTime: value.startTime,
					endTime: value.endTime,
					lunchStartTime: value.lunchStartTime,
					lunchEndTime: value.lunchEndTime,
					hours: value.hours
				}))
				// Drop any row whose workday didn't resolve rather than writing an
				// orphaned (un-strippable) hours_raw entry.
				.filter((entry) => entry.workdayId);

			// createUTCDateTime returns Date objects; Drizzle's JSON column serializes
			// them to ISO strings on write, matching RawTimesheetHours (typed as
			// strings). Cast through unknown to satisfy the static type.
			const formattedEntries = entriesArray.map((entry) => ({
				...entry,
				startTime: createUTCDateTime(entry.date, entry.startTime, requisition.referenceTimezone),
				endTime: createUTCDateTime(entry.date, entry.endTime, requisition.referenceTimezone),
				lunchStartTime: entry.lunchStartTime
					? createUTCDateTime(entry.date, entry.lunchStartTime, requisition.referenceTimezone)
					: null,
				lunchEndTime: entry.lunchEndTime
					? createUTCDateTime(entry.date, entry.lunchEndTime, requisition.referenceTimezone)
					: null
			})) as unknown as RawTimesheetHours[];

			const [result] = await db
				.update(timeSheetTable)
				.set({
					totalHoursWorked: totalHours.toString(),
					hoursRaw: formattedEntries,
					status: 'PENDING',
					discrepancyNote: null,
					submittedAt: new Date(),
					updatedAt: new Date()
				})
				.where(eq(timeSheetTable.id, id))
				.returning();

			await writeActionHistory({
				action: 'UPDATE',
				userId: user.id,
				entityId: result.id,
				table: 'TIMESHEETS',
				beforeState: timesheet,
				afterState: result
			});

			await notifyTimesheetSubmitted(result.id);

			setFlash(
				{ type: 'success', message: 'Timesheet corrected and resubmitted successfully!' },
				event
			);
			return { success: true };
		} catch (err) {
			console.error('Error resubmitting timesheet:', err);
			setFlash({ type: 'error', message: 'Failed to resubmit timesheet' }, event);
			return fail(500, { error: 'Failed to resubmit timesheet' });
		}
	},

	rejectTimesheet: async (event: RequestEvent) => {
		const user = event.locals.user;
		if (!user) {
			redirect(302, '/auth/sign-in');
		}

		// Only admins and clients may reject, and only a submitted (PENDING) sheet —
		// you can't reject a draft, an already-approved, or a voided timesheet.
		if (
			user.role !== USER_ROLES.SUPERADMIN &&
			user.role !== USER_ROLES.CLIENT &&
			user.role !== USER_ROLES.CLIENT_STAFF
		) {
			return fail(403, { error: 'Forbidden' });
		}

		const { id } = event.params;

		const existing = await getTimesheetById(id);
		if (!existing) {
			return fail(404, { error: 'Timesheet not found' });
		}
		if (existing.status !== 'PENDING') {
			setFlash(
				{ type: 'error', message: 'Only a submitted (pending) timesheet can be rejected.' },
				event
			);
			return fail(400, { error: 'Timesheet is not pending' });
		}

		const formData = await event.request.formData();
		const discrepancyNote = formData.get('discrepancyNote') as string;

		if (!discrepancyNote || !discrepancyNote.trim()) {
			setFlash({ type: 'error', message: 'Please provide a reason for rejection' }, event);
			return fail(400, { error: 'Discrepancy note is required' });
		}

		try {
			await rejectTimesheet(id, user.id, discrepancyNote.trim());
			setFlash({ type: 'success', message: 'Timesheet rejected' }, event);
			return { success: true };
		} catch (error) {
			await revertTimesheetToPending(id, user.id);
			console.error('Error rejecting timesheet:', error);
			setFlash({ type: 'error', message: 'Error rejecting timesheet' }, event);
			return fail(500, { error: 'Failed to reject timesheet' });
		}
	},

	approveTimesheet: async (event: RequestEvent) => {
		const { id } = event.params;
		const { user } = event.locals;
		if (user === null) {
			redirect(302, '/auth/sign-in');
		}

		// Only admins and clients may approve. (Status is guarded inside
		// approveAndInvoiceTimesheet, which rejects anything not PENDING/DISCREPANCY.)
		if (
			user.role !== USER_ROLES.SUPERADMIN &&
			user.role !== USER_ROLES.CLIENT &&
			user.role !== USER_ROLES.CLIENT_STAFF
		) {
			return fail(403, { error: 'Forbidden' });
		}

		const result = await approveAndInvoiceTimesheet(id, { actorUserId: user.id });

		if (result.ok) {
			setFlash({ type: 'success', message: 'Timesheet approved' }, event);
			return { success: true, message: 'Timesheet approved', timesheet: result.timesheet };
		}

		const message =
			result.reason === 'PENDING_EXPENSES'
				? `Cannot approve timesheet: ${result.pendingExpenseCount} expense(s) still pending review.`
				: result.reason === 'UNFINISHED_WORKDAYS'
					? `Cannot approve yet: ${result.unfinishedCount} assigned workday(s) this week have not ended.`
					: result.reason === 'ZERO_AMOUNT'
						? 'Cannot approve timesheet: Invoice amount is $0.00. Please verify hours worked and hourly rate.'
						: result.reason === 'NO_STRIPE_CUSTOMER'
							? 'No Stripe customer found for this client.'
							: result.reason === 'NOT_FOUND'
								? 'Timesheet not found.'
								: result.reason === 'NOT_PENDING'
									? 'Cannot approve: the timesheet must be submitted (PENDING) first.'
									: 'Error approving timesheet';
		setFlash({ type: 'error', message }, event);
		return fail(result.reason === 'ERROR' ? 500 : 400, { error: message });
	},

	// Post-approval "experience survey": the client answered that they would NOT
	// keep working with this candidate. Blacklist the candidate from the company
	// owning this timesheet so they stop surfacing in the qualified-candidate
	// search and any future shifts they hold for it are cleared. Candidate +
	// company are resolved server-side from the timesheet — never trusted from
	// the client. Admins approving on a client's behalf can use the same survey.
	submitApprovalSurvey: async (event: RequestEvent) => {
		const { id } = event.params;
		const { user } = event.locals;
		if (!user) {
			return fail(401, { error: 'Unauthorized' });
		}
		if (
			user.role !== USER_ROLES.SUPERADMIN &&
			user.role !== USER_ROLES.CLIENT &&
			user.role !== USER_ROLES.CLIENT_STAFF
		) {
			return fail(403, { error: 'Forbidden' });
		}

		const timesheet = await getTimesheetById(id);
		if (!timesheet || !timesheet.requisitionId) {
			return fail(404, { error: 'Timesheet not found' });
		}

		const requisition = await getRequisitionById(timesheet.requisitionId);
		if (!requisition) {
			return fail(404, { error: 'Requisition not found' });
		}

		try {
			await addCandidateToBlacklist(timesheet.associatedCandidateId, requisition.companyId, {
				actorUserId: user.id,
				actorRole: user.role as 'SUPERADMIN' | 'CLIENT' | 'CLIENT_STAFF',
				reason: 'experience survey'
			});
			setFlash(
				{ type: 'success', message: "Thanks — this candidate won't be matched here again." },
				event
			);
			return { success: true };
		} catch (err) {
			logger.error('submitApprovalSurvey failed', { error: err, timesheetId: id });
			setFlash({ type: 'error', message: 'Could not save your feedback.' }, event);
			return fail(500, { error: 'Failed to record feedback' });
		}
	},

	// Void a timesheet that HAS an invoice: voids the timesheet + its invoice
	// (paper or Stripe), clears wages, and disconnects workdays so a corrected
	// timesheet can regenerate.
	voidTimesheet: async (event: RequestEvent) => {
		const user = event.locals.user;
		if (!user || user.role !== USER_ROLES.SUPERADMIN) {
			redirect(302, '/auth/sign-in');
		}
		const userId = user.id;
		try {
			const { id } = event.params;
			// Optional admin note from the dialog; default when left blank.
			const formData = await event.request.formData();
			const reason =
				formData.get('reason')?.toString().trim() || 'The associated timesheet was voided.';
			const { invoiceId } = await voidTimesheetWithInvoice(id, userId);
			// Flip the invoice record to void + email the client exactly once. Voiding
			// from the timesheet side is functionally the same void as from the invoice
			// page, so the client gets the same notification either way.
			if (invoiceId) {
				await voidInvoiceAndNotify(invoiceId, reason);
			}
			setFlash({ type: 'success', message: 'Timesheet and invoice voided' }, event);
			return { success: true };
		} catch (err) {
			logger.error('timesheet void failed', {
				error: err,
				timesheetId: event.params.id,
				distinctId: userId
			});
			const message =
				err && typeof err === 'object' && 'body' in err
					? // SvelteKit error() carries a { message } body
						(err as { body?: { message?: string } }).body?.message
					: undefined;
			setFlash({ type: 'error', message: message || 'Error voiding timesheet' }, event);
			return fail(500, { error: 'Failed to void timesheet' });
		}
	},

	// Delete a timesheet that has NO invoice: removes the row and disconnects its
	// workdays (nulls timesheetId) so they regenerate a fresh timesheet.
	deleteTimesheet: async (event: RequestEvent) => {
		const user = event.locals.user;
		if (!user || user.role !== USER_ROLES.SUPERADMIN) {
			redirect(302, '/auth/sign-in');
		}
		const { id } = event.params;

		// Delete is only for pre-approval sheets (generated in error / corrupt data
		// that should regenerate). Once approved it must be VOIDed, not deleted.
		const existing = await getTimesheetById(id);
		if (!existing) {
			return fail(404, { error: 'Timesheet not found' });
		}
		if (existing.status === 'APPROVED' || existing.status === 'VOID') {
			setFlash(
				{ type: 'error', message: 'Approved timesheets must be voided, not deleted.' },
				event
			);
			return fail(400, { error: 'Cannot delete an approved or voided timesheet' });
		}

		try {
			await deleteTimesheet(id, user.id);
			setFlash({ type: 'success', message: 'Timesheet deleted' }, event);
		} catch (err) {
			logger.error('timesheet delete failed', {
				error: err,
				timesheetId: event.params.id,
				distinctId: user.id
			});
			const message =
				err && typeof err === 'object' && 'body' in err
					? (err as { body?: { message?: string } }).body?.message
					: undefined;
			setFlash({ type: 'error', message: message || 'Error deleting timesheet' }, event);
			return fail(500, { error: 'Failed to delete timesheet' });
		}
		// Deleted — nothing to return to; send the admin back to the list.
		redirect(303, '/timesheets');
	},

	adminOverrideTimesheet: async (event: RequestEvent) => {
		if (event.locals.user === null) {
			redirect(302, '/auth/sign-in');
		}
		if (event.locals.user?.role !== USER_ROLES.SUPERADMIN) {
			throw error(403, 'Forbidden');
		}
		const { user } = event.locals;
		const { id } = event.params;
		try {
			const timesheet = await getTimesheetById(id);

			if (!timesheet) {
				return fail(404, { error: 'Timesheet not found' });
			}

			// Override is a correction path for unapproved sheets only. An already
			// APPROVED or VOID sheet must be voided (which regenerates a fresh one)
			// rather than re-approved.
			if (timesheet.status === 'APPROVED' || timesheet.status === 'VOID') {
				setFlash(
					{
						type: 'error',
						message: `Cannot override a ${timesheet.status.toLowerCase()} timesheet`
					},
					event
				);
				return fail(409, { error: 'Timesheet is locked' });
			}

			// Same approval gate as normal approval — every shift linked to this
			// timesheet must have ended before billing.
			const unfinishedWorkdays = await getUnfinishedWorkdaysForTimesheet(timesheet.id);
			if (unfinishedWorkdays.length > 0) {
				setFlash(
					{
						type: 'error',
						message: `Cannot approve yet: ${unfinishedWorkdays.length} shift(s) on this timesheet have not ended.`
					},
					event
				);
				return fail(400, { error: 'All shifts on this timesheet must end before approval' });
			}

			const overridden = await adminOverrideTimesheet(id, user.id, timesheet);
			const requisition = overridden.requisitionId
				? await getRequisitionById(overridden.requisitionId)
				: null;

			if (!requisition) {
				throw new Error('Requisition not found for timesheet');
			}

			const [adminConfig] = await db.select().from(adminConfigTable).limit(1);

			const existingExpenses = await listTimesheetExpenses(id);
			const pendingExpenses = existingExpenses.filter((e) => e.status === 'PENDING');
			if (pendingExpenses.length > 0) {
				setFlash(
					{
						type: 'error',
						message: `Cannot approve timesheet: ${pendingExpenses.length} expense${pendingExpenses.length === 1 ? ' is' : 's are'} still pending review.`
					},
					event
				);
				return fail(400, { error: 'Resolve all pending expenses before approving' });
			}
			const approvedExpenses = existingExpenses.filter((e) => e.status === 'APPROVED');
			const expensesTotalCents = approvedExpenses.reduce((sum, e) => sum + e.amountCents, 0);

			const effectiveRate = overridden.adjustedHourlyRate ?? requisition.hourlyRate;

			// Continue weekly overtime across any APPROVED sibling timesheets for
			// this candidate+requisition+week (split-week handling).
			const priorWeekHours = overridden.requisitionId
				? await getApprovedBilledHoursForWeek({
						candidateId: overridden.associatedCandidateId,
						requisitionId: overridden.requisitionId,
						weekBeginDate: overridden.weekBeginDate,
						excludeTimesheetId: overridden.id
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
				setFlash(
					{
						type: 'error',
						message:
							'Cannot approve timesheet: Invoice amount is $0.00. Please verify hours worked and hourly rate.'
					},
					event
				);
				await revertTimesheetToPending(id, user.id);
				return fail(400, { error: 'Invoice amount must be greater than $0.00' });
			}

			// Only ever put the candidate/professional's name on the invoice.
			const { candidate } = await getCandidateProfileById(overridden.associatedCandidateId);
			const candidateName = `${candidate.user.firstName} ${candidate.user.lastName}`;

			// Requisition rows carry only `disciplineId`; the memo shows the pair.
			const discipline = await getDisciplineById(requisition.disciplineId);

			const clientProfile = await getClientProfileById(overridden.associatedClientId);
			const isPaperBilling = clientProfile?.profile.clientInvoiceMethod === 'PAPER';

			// Billing contact — stamps `customerEmail` on the row (previously NULL on
			// this path, which made the overdue-reminder cron skip it) and addresses
			// the invoice-created email.
			const billingRecipient = await resolveBillingRecipient(overridden.associatedClientId);

			if (isPaperBilling) {
				const effectiveRateDollars = effectiveRate ?? 0;

				const paperInvoice = await createPaperInvoiceRecord(
					{
						clientId: overridden.associatedClientId,
						amountInDollars: (finalAmt / 100).toFixed(2),
						customerEmail: billingRecipient?.email ?? undefined,
						sourceType: 'timesheet',
						timesheetId: overridden.id,
						requisitionId: overridden.requisitionId ?? undefined,
						candidateId: overridden.associatedCandidateId,
						description: buildTimesheetInvoiceDescription({
							candidateName,
							companyName: clientProfile?.company?.companyName ?? null,
							requisitionId: overridden.requisitionId ?? null,
							timesheetId: overridden.id,
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
					user.id
				);

				if (paperInvoice?.id) {
					await notifyInvoiceCreated({
						invoiceId: paperInvoice.id,
						dueDate: paperInvoice.dueDate
					});
				}
			} else {
				const stripeCustomerId = await getClientSubscription(overridden.associatedClientId);

				if (!stripeCustomerId) {
					return fail(404, { error: 'No Stripe customer found for this client' });
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
					{ userId: user.id, timesheetId: overridden.id, clientId: overridden.associatedClientId },
					buildTimesheetInvoiceDescription({
						candidateName,
						companyName: clientProfile?.company?.companyName ?? null,
						requisitionId: overridden.requisitionId ?? null,
						timesheetId: overridden.id,
						regularHours: breakdown.regularHours,
						overtimeHours: breakdown.overtimeHours,
						hasAdminFee: adminFeeCents > 0,
						hasProcessingFee,
						disciplineName: discipline?.name ?? null,
						disciplineAbbreviation: discipline?.abbreviation ?? null
					})
				);

				const invoiceRow = await createInvoiceRecord(
					{
						clientId: overridden.associatedClientId,
						timesheet: overridden,
						stripeInvoice,
						amountInDollars: (stripeInvoice.amount_due / 100).toFixed(2)
					},
					user.id
				);

				if (invoiceRow?.id) {
					await notifyInvoiceCreated({
						invoiceId: invoiceRow.id,
						hostedUrl: stripeInvoice.hosted_invoice_url,
						dueDate: invoiceRow.dueDate
					});
				}
			}

			setFlash({ type: 'success', message: 'Timesheet approved' }, event);
			return { success: true, message: 'Timesheet approved', overridden };
		} catch (err) {
			// adminOverrideTimesheet already flipped the sheet to APPROVED; if invoice
			// generation then threw, revert it so it isn't stranded APPROVED-without-
			// invoice (which the "cannot override an approved timesheet" guard would
			// otherwise block from retry). Mirrors the main approval path.
			await revertTimesheetToPending(id, user.id);
			logger.error('timesheet adminOverride failed', {
				error: err,
				timesheetId: id,
				distinctId: user.id
			});
			setFlash({ type: 'error', message: 'Error overriding timesheet' }, event);
			return { success: false };
		}
	},
	markWagesPaid: async (event: RequestEvent) => {
		const user = event.locals.user;
		const { id } = event.params;

		if (!user || user.role !== USER_ROLES.SUPERADMIN) {
			return fail(403, { error: 'Unauthorized' });
		}

		try {
			const [original] = await db
				.select()
				.from(timeSheetTable)
				.where(eq(timeSheetTable.id, id))
				.limit(1);

			if (!original) return fail(404, { error: 'Timesheet not found' });
			if (original.status !== 'APPROVED') {
				return fail(400, { error: 'Timesheet must be approved before marking wages paid' });
			}

			const [result] = await db
				.update(timeSheetTable)
				.set({ wagesStatus: 'WAGES_PAID', updatedAt: new Date() })
				.where(eq(timeSheetTable.id, id))
				.returning();

			await writeActionHistory({
				table: 'TIMESHEETS',
				userId: user.id,
				action: 'UPDATE',
				entityId: id,
				beforeState: original,
				afterState: result,
				metadata: { wagesStatus: 'WAGES_PAID' }
			});

			setFlash({ type: 'success', message: 'Wages marked as paid' }, event);
			return { success: true };
		} catch (err) {
			console.error('Error marking wages paid:', err);
			setFlash({ type: 'error', message: 'Failed to mark wages as paid' }, event);
			return fail(500, { error: 'Failed to mark wages as paid' });
		}
	},
	markWagesDue: async (event: RequestEvent) => {
		const user = event.locals.user;
		const { id } = event.params;

		if (!user || user.role !== USER_ROLES.SUPERADMIN) {
			return fail(403, { error: 'Unauthorized' });
		}

		try {
			const [original] = await db
				.select()
				.from(timeSheetTable)
				.where(eq(timeSheetTable.id, id))
				.limit(1);

			if (!original) return fail(404, { error: 'Timesheet not found' });
			if (original.status !== 'APPROVED') {
				return fail(400, { error: 'Timesheet must be approved to change wages status' });
			}

			const [result] = await db
				.update(timeSheetTable)
				.set({ wagesStatus: 'WAGES_DUE', updatedAt: new Date() })
				.where(eq(timeSheetTable.id, id))
				.returning();

			await writeActionHistory({
				table: 'TIMESHEETS',
				userId: user.id,
				action: 'UPDATE',
				entityId: id,
				beforeState: original,
				afterState: result,
				metadata: { wagesStatus: 'WAGES_DUE' }
			});

			setFlash({ type: 'success', message: 'Wages marked as due' }, event);
			return { success: true };
		} catch (err) {
			console.error('Error marking wages due:', err);
			setFlash({ type: 'error', message: 'Failed to mark wages as due' }, event);
			return fail(500, { error: 'Failed to mark wages as due' });
		}
	},

	addExpense: async (event: RequestEvent) => {
		const user = event.locals.user;
		const { id: timesheetId } = event.params;
		if (!user) redirect(302, '/auth/sign-in');

		const form = await superValidate(event, addExpenseSchema);
		if (!form.valid) {
			setFlash({ type: 'error', message: 'Please correct the expense form.' }, event);
			return fail(400, { form });
		}

		const timesheet = await getTimesheetById(timesheetId);
		if (!timesheet) {
			setFlash({ type: 'error', message: 'Timesheet not found' }, event);
			return fail(404, { form });
		}
		if (timesheet.status === 'APPROVED' || timesheet.status === 'VOID') {
			setFlash(
				{
					type: 'error',
					message: 'Cannot add expenses to an approved or voided timesheet'
				},
				event
			);
			return fail(400, { form });
		}

		// Only admin and the assigned candidate may add via this server action.
		// Clients/staff don't add expenses — they approve/reject.
		if (
			user.role !== USER_ROLES.SUPERADMIN &&
			!(user.role === USER_ROLES.CANDIDATE && timesheet.associatedCandidateId)
		) {
			return fail(403, { form });
		}

		try {
			await createTimesheetExpense(
				{
					timesheetId,
					candidateId: timesheet.associatedCandidateId,
					description: form.data.description,
					amountCents: Math.round(form.data.amountDollars * 100),
					createdByUserId: user.id
				},
				user.id
			);
			setFlash({ type: 'success', message: 'Expense added' }, event);
			return { form };
		} catch (err) {
			console.error('Error adding expense:', err);
			setFlash({ type: 'error', message: 'Failed to add expense' }, event);
			return fail(500, { form });
		}
	},

	updateExpense: async (event: RequestEvent) => {
		const user = event.locals.user;
		if (!user) redirect(302, '/auth/sign-in');

		const formData = await event.request.formData();
		const expenseId = String(formData.get('expenseId') ?? '');
		const description = String(formData.get('description') ?? '').trim();
		const amountDollarsRaw = String(formData.get('amountDollars') ?? '').trim();
		const amountDollars = parseFloat(amountDollarsRaw);

		if (!expenseId) return fail(400, { error: 'Missing expense id' });

		const existing = await getTimesheetExpenseById(expenseId);
		if (!existing) return fail(404, { error: 'Expense not found' });

		// Admin can edit any pending expense. Candidate can edit only their own.
		const isOwnerCandidate =
			user.role === USER_ROLES.CANDIDATE && existing.createdByUserId === user.id;
		if (user.role !== USER_ROLES.SUPERADMIN && !isOwnerCandidate) {
			return fail(403, { error: 'Forbidden' });
		}

		try {
			await updateTimesheetExpense(
				expenseId,
				{
					description: description || undefined,
					amountCents: isFinite(amountDollars) ? Math.round(amountDollars * 100) : undefined
				},
				user.id
			);
			setFlash({ type: 'success', message: 'Expense updated' }, event);
			return { success: true };
		} catch (err: any) {
			console.error('Error updating expense:', err);
			setFlash({ type: 'error', message: err?.body?.message ?? 'Failed to update expense' }, event);
			return fail(500, { error: 'Failed to update expense' });
		}
	},

	deleteExpense: async (event: RequestEvent) => {
		const user = event.locals.user;
		if (!user) redirect(302, '/auth/sign-in');

		const formData = await event.request.formData();
		const expenseId = String(formData.get('expenseId') ?? '');
		if (!expenseId) return fail(400, { error: 'Missing expense id' });

		const existing = await getTimesheetExpenseById(expenseId);
		if (!existing) return fail(404, { error: 'Expense not found' });

		const isOwnerCandidate =
			user.role === USER_ROLES.CANDIDATE && existing.createdByUserId === user.id;
		if (user.role !== USER_ROLES.SUPERADMIN && !isOwnerCandidate) {
			return fail(403, { error: 'Forbidden' });
		}

		try {
			await deleteTimesheetExpense(expenseId, user.id);
			setFlash({ type: 'success', message: 'Expense deleted' }, event);
			return { success: true };
		} catch (err: any) {
			console.error('Error deleting expense:', err);
			setFlash({ type: 'error', message: err?.body?.message ?? 'Failed to delete expense' }, event);
			return fail(500, { error: 'Failed to delete expense' });
		}
	},

	approveExpense: async (event: RequestEvent) => {
		const user = event.locals.user;
		if (!user) redirect(302, '/auth/sign-in');

		// Only admin, client, or client-staff may approve.
		if (
			user.role !== USER_ROLES.SUPERADMIN &&
			user.role !== USER_ROLES.CLIENT &&
			user.role !== USER_ROLES.CLIENT_STAFF
		) {
			return fail(403, { error: 'Forbidden' });
		}

		const formData = await event.request.formData();
		const expenseId = String(formData.get('expenseId') ?? '');
		if (!expenseId) return fail(400, { error: 'Missing expense id' });

		try {
			await approveTimesheetExpense(expenseId, user.id);
			setFlash({ type: 'success', message: 'Expense approved' }, event);
			return { success: true };
		} catch (err: any) {
			console.error('Error approving expense:', err);
			setFlash({ type: 'error', message: 'Failed to approve expense' }, event);
			return fail(500, { error: 'Failed to approve expense' });
		}
	},

	rejectExpense: async (event: RequestEvent) => {
		const user = event.locals.user;
		if (!user) redirect(302, '/auth/sign-in');

		if (
			user.role !== USER_ROLES.SUPERADMIN &&
			user.role !== USER_ROLES.CLIENT &&
			user.role !== USER_ROLES.CLIENT_STAFF
		) {
			return fail(403, { error: 'Forbidden' });
		}

		const formData = await event.request.formData();
		const expenseId = String(formData.get('expenseId') ?? '');
		const reason = String(formData.get('reason') ?? '').trim();
		if (!expenseId) return fail(400, { error: 'Missing expense id' });
		if (!reason) {
			setFlash({ type: 'error', message: 'A rejection reason is required' }, event);
			return fail(400, { error: 'Reason required' });
		}

		try {
			await rejectTimesheetExpense(expenseId, user.id, reason);
			setFlash({ type: 'success', message: 'Expense rejected' }, event);
			return { success: true };
		} catch (err: any) {
			console.error('Error rejecting expense:', err);
			setFlash({ type: 'error', message: 'Failed to reject expense' }, event);
			return fail(500, { error: 'Failed to reject expense' });
		}
	}
};
