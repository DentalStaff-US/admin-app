import { USER_ROLES } from '$lib/config/constants';
import {
	getClientCompanyByClientId,
	getClientProfileById,
	getClientProfileByStaffUserId,
	getClientProfilebyUserId,
	getClientSubscription
} from '$lib/server/database/queries/clients';
import {
	adminOverrideTimesheet,
	approveTimesheet,
	approveTimesheetExpense,
	convertToStripeAmount,
	createInvoiceRecord,
	createTimesheetExpense,
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
	getWorkdaysForTimesheet,
	listTimesheetExpenses,
	rejectTimesheet,
	rejectTimesheetExpense,
	revertTimesheetToPending,
	updateTimesheetExpense,
	updateTimesheetHours,
	voidTimesheet,
	createPaperInvoiceRecord
} from '$lib/server/database/queries/requisitions';
import type { TimesheetExpenseSelect } from '$lib/server/database/schemas/requisition';
import { error, fail, redirect } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import { setFlash } from 'sveltekit-flash-message/server';
import { createStripeInvoice, stripe } from '$lib/server/stripe';
import db from '$lib/server/database/drizzle';
import { desc, eq } from 'drizzle-orm';
import { adminConfigTable } from '$lib/server/database/schemas/config';
import { actionHistoryTable } from '$lib/server/database/schemas/admin';
import { redirectIfNotValidCustomer } from '$lib/server/database/queries/billing';
import { userTable } from '$lib/server/database/schemas/auth';
import { getUserById } from '$lib/server/database/queries/users';
import { timeSheetTable, workdayTable } from '$lib/server/database/schemas/requisition';
import { createUTCDateTime } from '$lib/_helpers/UTCTimezoneUtils';
import type { RawTimesheetHours } from '$lib/server/database/schemas/requisition';
import { writeActionHistory } from '$lib/server/database/queries/admin';
import { clientProfileTable } from '$lib/server/database/schemas/client';
import { notifyTimesheetSubmitted } from '$lib/server/notifications/transactional';
import { superValidate } from 'sveltekit-superforms/server';
import { addExpenseSchema } from '$lib/config/zod-schemas';

const ADMIN_FEE_LINE_DESCRIPTION = 'Administration Fees';

function calculateAdminFeeCents(
	billableCents: number,
	adminFee: number,
	adminFeeType: 'PERCENTAGE' | 'FIXED'
): number {
	if (!adminFee || adminFee <= 0) return 0;
	if (adminFeeType === 'PERCENTAGE') {
		return Math.round((billableCents * adminFee) / 100);
	}
	return Math.round(adminFee * 100);
}

function buildStripeLineItems({
	billableCents,
	adminFeeCents,
	hoursDescription,
	expenses
}: {
	billableCents: number;
	adminFeeCents: number;
	hoursDescription: string;
	expenses: TimesheetExpenseSelect[];
}) {
	const lineItems: Array<{ amountInCents: number; description: string }> = [
		{ amountInCents: billableCents, description: hoursDescription }
	];
	for (const expense of expenses) {
		lineItems.push({
			amountInCents: expense.amountCents,
			description: `Expense: ${expense.description}`
		});
	}
	if (adminFeeCents > 0) {
		lineItems.push({ amountInCents: adminFeeCents, description: ADMIN_FEE_LINE_DESCRIPTION });
	}
	return lineItems;
}

function buildPaperLineItems({
	hoursWorked,
	effectiveRateDollars,
	billableCents,
	adminFeeCents,
	hoursDescription,
	expenses
}: {
	hoursWorked: number;
	effectiveRateDollars: number;
	billableCents: number;
	adminFeeCents: number;
	hoursDescription: string;
	expenses: TimesheetExpenseSelect[];
}) {
	const rateCents = Math.round(effectiveRateDollars * 100);
	const items = [
		{
			id: crypto.randomUUID(),
			description: hoursDescription,
			quantity: hoursWorked,
			rate: rateCents,
			unit_amount: rateCents,
			unit_amount_excluding_tax: rateCents,
			amount: billableCents,
			currency: 'usd',
			type: 'paper' as const
		}
	];
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

		console.log(requisition, 'requisition');

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
			addExpenseForm
		};
	}

	if (user.role === USER_ROLES.CLIENT_STAFF) {
		const client = await getClientProfileByStaffUserId(user.id);
		await redirectIfNotValidCustomer(client?.id, user.role);

		const timesheet = await getTimesheetDetails(id, client?.id);
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
			addExpenseForm
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

			const requisition = await getRequisitionById(timesheet.requisitionId);

			if (!requisition || !requisition.referenceTimezone) {
				throw error(400, 'Requisition timezone not found');
			}

			const entriesArray = Object.entries(entries)
				.filter(([_, value]: [string, any]) => value.hours > 0)
				.map(([date, value]: [string, any]) => ({
					date,
					startTime: value.startTime,
					endTime: value.endTime,
					lunchStartTime: value.lunchStartTime,
					lunchEndTime: value.lunchEndTime,
					hours: value.hours
				}));

			const formattedEntries: RawTimesheetHours[] = entriesArray.map((entry) => ({
				...entry,
				startTime: createUTCDateTime(entry.date, entry.startTime, requisition.referenceTimezone),
				endTime: createUTCDateTime(entry.date, entry.endTime, requisition.referenceTimezone),
				lunchStartTime: entry.lunchStartTime
					? createUTCDateTime(entry.date, entry.lunchStartTime, requisition.referenceTimezone)
					: null,
				lunchEndTime: entry.lunchEndTime
					? createUTCDateTime(entry.date, entry.lunchEndTime, requisition.referenceTimezone)
					: null
			}));

			const [result] = await db
				.update(timeSheetTable)
				.set({
					totalHoursWorked: totalHours.toString(),
					hoursRaw: formattedEntries,
					status: 'PENDING',
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

			const requisition = await getRequisitionById(timesheet.requisitionId);

			if (!requisition || !requisition.referenceTimezone) {
				throw error(400, 'Requisition timezone not found');
			}

			const entriesArray = Object.entries(entries)
				.filter(([_, value]: [string, any]) => value.hours > 0)
				.map(([date, value]: [string, any]) => ({
					date,
					startTime: value.startTime,
					endTime: value.endTime,
					lunchStartTime: value.lunchStartTime,
					lunchEndTime: value.lunchEndTime,
					hours: value.hours
				}));

			const formattedEntries: RawTimesheetHours[] = entriesArray.map((entry) => ({
				...entry,
				startTime: createUTCDateTime(entry.date, entry.startTime, requisition.referenceTimezone),
				endTime: createUTCDateTime(entry.date, entry.endTime, requisition.referenceTimezone),
				lunchStartTime: entry.lunchStartTime
					? createUTCDateTime(entry.date, entry.lunchStartTime, requisition.referenceTimezone)
					: null,
				lunchEndTime: entry.lunchEndTime
					? createUTCDateTime(entry.date, entry.lunchEndTime, requisition.referenceTimezone)
					: null
			}));

			const [result] = await db
				.update(timeSheetTable)
				.set({
					totalHoursWorked: totalHours.toString(),
					hoursRaw: formattedEntries,
					status: 'PENDING',
					discrepancyNote: null,
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

		const { id } = event.params;
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
		try {
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

			const timesheet = await approveTimesheet(id, user.id);
			const requisition = timesheet.requisitionId
				? await getRequisitionById(timesheet.requisitionId)
				: null;
			if (!requisition) {
				throw new Error('Requisition not found for timesheet');
			}

			const approvedExpenses = existingExpenses.filter((e) => e.status === 'APPROVED');
			const expensesTotalCents = approvedExpenses.reduce((sum, e) => sum + e.amountCents, 0);

			const effectiveRate = timesheet.adjustedHourlyRate ?? requisition.hourlyRate;

			const amountInCents = convertToStripeAmount(
				timesheet.totalHoursWorked || 0,
				effectiveRate,
				effectiveRate && effectiveRate * 1.5
			);

			const adminFeeCents = calculateAdminFeeCents(
				amountInCents,
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

			const clientProfile = await getClientProfileById(timesheet.associatedClientId);
			const isPaperBilling = clientProfile?.profile.clientInvoiceMethod === 'PAPER';

			console.log({ clientProfile, isPaperBilling });

			if (isPaperBilling) {
				const hoursWorked = parseFloat(String(timesheet.totalHoursWorked ?? 0));
				const effectiveRateDollars = effectiveRate ?? 0;

				await createPaperInvoiceRecord(
					{
						clientId: timesheet.associatedClientId,
						amountInDollars: (finalAmt / 100).toFixed(2),
						sourceType: 'timesheet',
						timesheetId: timesheet.id,
						requisitionId: timesheet.requisitionId ?? undefined,
						candidateId: timesheet.associatedCandidateId,
						description: `Dental Temp Staffing Solutions invoice: Hours worked for timesheet ${id}`,
						lineItems: buildPaperLineItems({
							hoursWorked,
							effectiveRateDollars,
							billableCents: amountInCents,
							adminFeeCents,
							hoursDescription: `Hours worked for timesheet ${id}`,
							expenses: approvedExpenses
						})
					},
					user.id
				);
			} else {
				const stripeCustomerId =
					(await getClientSubscription(timesheet.associatedClientId)) || user.stripeCustomerId;

				const stripeInvoice = await createStripeInvoice(
					stripeCustomerId,
					buildStripeLineItems({
						billableCents: amountInCents,
						adminFeeCents,
						hoursDescription: `Invoice for timesheet ${id}`,
						expenses: approvedExpenses
					}),
					{ userId: user.id, timesheetId: timesheet.id, clientId: timesheet.associatedClientId },
					`Dental Temp Staffing Solutions invoice: Hours worked for ${user.firstName} ${user.lastName} for timesheet ${id}`
				);

				await createInvoiceRecord(
					{
						clientId: timesheet.associatedClientId,
						timesheet,
						stripeInvoice,
						amountInDollars: (stripeInvoice.amount_due / 100).toFixed(2)
					},
					user.id
				);
			}

			setFlash({ type: 'success', message: 'Timesheet approved' }, event);
			return { success: true, message: 'Timesheet approved', timesheet };
		} catch (err) {
			await revertTimesheetToPending(id, user?.id);
			console.error('Error approving timesheet:', err);
			setFlash({ type: 'error', message: 'Error approving timesheet' }, event);
			return { success: false };
		}
	},

	voidTimesheet: async (event: RequestEvent) => {
		const user = event.locals.user;
		if (!user) {
			redirect(302, '/auth/sign-in');
		}
		const userId = user.id;
		try {
			const { id } = event.params;
			await voidTimesheet(id, userId);
			setFlash({ type: 'success', message: 'Timesheet voided' }, event);
			return { succes: true };
		} catch (error) {
			console.error('Error rejecting timesheet:', error);
			setFlash({ type: 'error', message: 'Error voiding timesheet' }, event);
		}
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

			const amountInCents = convertToStripeAmount(
				timesheet.totalHoursWorked || 0,
				effectiveRate,
				effectiveRate && effectiveRate * 1.5
			);

			const adminFeeCents = calculateAdminFeeCents(
				amountInCents,
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

			const clientProfile = await getClientProfileById(overridden.associatedClientId);
			const isPaperBilling = clientProfile?.profile.clientInvoiceMethod === 'PAPER';

			if (isPaperBilling) {
				const hoursWorked = parseFloat(String(overridden.totalHoursWorked ?? 0));
				const effectiveRateDollars = effectiveRate ?? 0;

				await createPaperInvoiceRecord(
					{
						clientId: overridden.associatedClientId,
						amountInDollars: (finalAmt / 100).toFixed(2),
						sourceType: 'timesheet',
						timesheetId: overridden.id,
						requisitionId: overridden.requisitionId ?? undefined,
						candidateId: overridden.associatedCandidateId,
						description: `Dental Temp Staffing Solutions invoice: Hours worked for timesheet ${id}`,
						lineItems: buildPaperLineItems({
							hoursWorked,
							effectiveRateDollars,
							billableCents: amountInCents,
							adminFeeCents,
							hoursDescription: `Hours worked for timesheet ${id}`,
							expenses: approvedExpenses
						})
					},
					user.id
				);
			} else {
				const stripeCustomerId = await getClientSubscription(overridden.associatedClientId);

				if (!stripeCustomerId) {
					return fail(404, { error: 'No Stripe customer found for this client' });
				}

				const stripeInvoice = await createStripeInvoice(
					stripeCustomerId,
					buildStripeLineItems({
						billableCents: amountInCents,
						adminFeeCents,
						hoursDescription: `Invoice for timesheet ${id}`,
						expenses: approvedExpenses
					}),
					{ userId: user.id, timesheetId: overridden.id, clientId: overridden.associatedClientId },
					`Dental Temp Staffing Solutions invoice: Hours worked for ${user.firstName} ${user.lastName} for timesheet ${id}`
				);

				await createInvoiceRecord(
					{
						clientId: overridden.associatedClientId,
						timesheet: overridden,
						stripeInvoice,
						amountInDollars: (stripeInvoice.amount_due / 100).toFixed(2)
					},
					user.id
				);
			}

			setFlash({ type: 'success', message: 'Timesheet approved' }, event);
			return { success: true, message: 'Timesheet approved', overridden };
		} catch (error) {
			console.error('Error overriding timesheet:', error);
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
