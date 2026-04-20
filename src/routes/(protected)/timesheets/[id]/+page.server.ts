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
	convertToStripeAmount,
	createInvoiceRecord,
	getInvoiceByTimesheetId,
	getRecurrenceDaysForTimesheet,
	getRequisitionById,
	getRequisitionDetailsById,
	getRequisitionDetailsByIdAdmin,
	getTimesheetById,
	getTimesheetDetails,
	getTimesheetDetailsAdmin,
	getWorkdaysForTimesheet,
	rejectTimesheet,
	revertTimesheetToPending,
	updateTimesheetHours,
	voidTimesheet,
	createPaperInvoiceRecord
} from '$lib/server/database/queries/requisitions';
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

export const load = async (event: RequestEvent) => {
	const user = event.locals.user;
	if (!user) {
		redirect(302, '/auth/sign-in');
	}

	const { id } = event.params;

	if (user.role === USER_ROLES.SUPERADMIN) {
		const timesheet = await getTimesheetDetailsAdmin(id);
		const requisition = await getRequisitionDetailsByIdAdmin(timesheet.requisitionId);
		const recurrenceDays = await getRecurrenceDaysForTimesheet(timesheet);
		const workdays = await getWorkdaysForTimesheet(timesheet);
		const invoice = await getInvoiceByTimesheetId(id);
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

		return {
			user,
			timesheet,
			workdays,
			recurrenceDays,
			requisition: requisition.requisition,
			invoice
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

		return {
			user,
			timesheet,
			workdays,
			recurrenceDays,
			requisition: requisition.requisition,
			invoice
		};
	}

	return { user, timesheet: null, workdays: [], recurrenceDays: [], discrepancies: [] };
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

			const timesheet = await approveTimesheet(id, user.id);
			const requisition = timesheet.requisitionId
				? await getRequisitionById(timesheet.requisitionId)
				: null;
			if (!requisition) {
				throw new Error('Requisition not found for timesheet');
			}

			const effectiveRate = timesheet.adjustedHourlyRate ?? requisition.hourlyRate;

			const amountInCents = convertToStripeAmount(
				timesheet.totalHoursWorked || 0,
				effectiveRate,
				effectiveRate && effectiveRate * 1.5
			);

			const adminFee = adminConfig.adminPaymentFee;
			const adminFeeType = adminConfig.adminPaymentFeeType;
			let finalAmt = amountInCents;

			if (adminFeeType === 'PERCENTAGE') {
				finalAmt += Math.round((amountInCents * adminFee) / 100);
			} else if (adminFeeType === 'FIXED') {
				finalAmt += Math.round(adminFee * 100);
			}

			finalAmt = Math.round(finalAmt);

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
				const amountInDollars = (finalAmt / 100).toFixed(2);
				const hoursWorked = parseFloat(String(timesheet.totalHoursWorked ?? 0));
				const effectiveRateDollars = effectiveRate ?? 0;

				await createPaperInvoiceRecord(
					{
						clientId: timesheet.associatedClientId,
						amountInDollars,
						sourceType: 'timesheet',
						timesheetId: timesheet.id,
						requisitionId: timesheet.requisitionId ?? undefined,
						candidateId: timesheet.associatedCandidateId,
						description: `Dental Temp Staffing Solutions invoice: Hours worked for timesheet ${id}`,
						lineItems: [
							{
								id: crypto.randomUUID(),
								description: `Hours worked for timesheet ${id}`,
								quantity: hoursWorked,
								rate: Math.round(effectiveRateDollars * 100),
								unit_amount: Math.round(effectiveRateDollars * 100),
								unit_amount_excluding_tax: Math.round(effectiveRateDollars * 100),
								amount: Math.round(parseFloat(amountInDollars) * 100),
								currency: 'usd',
								type: 'paper'
							}
						]
					},
					user.id
				);
			} else {
				const stripeCustomerId =
					(await getClientSubscription(timesheet.associatedClientId)) || user.stripeCustomerId;

				const stripeInvoice = await createStripeInvoice(
					stripeCustomerId,
					[{ amountInCents: finalAmt, description: `Invoice for timesheet ${id}` }],
					{ userId: user.id, timesheetId: timesheet.id },
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

			const effectiveRate = overridden.adjustedHourlyRate ?? requisition.hourlyRate;

			const amountInCents = convertToStripeAmount(
				timesheet.totalHoursWorked || 0,
				effectiveRate,
				effectiveRate && effectiveRate * 1.5
			);

			const adminFee = adminConfig.adminPaymentFee;
			const adminFeeType = adminConfig.adminPaymentFeeType;
			let finalAmt = amountInCents;

			if (adminFeeType === 'PERCENTAGE') {
				finalAmt += Math.round((amountInCents * adminFee) / 100);
			} else if (adminFeeType === 'FIXED') {
				finalAmt += Math.round(adminFee * 100);
			}

			finalAmt = Math.round(finalAmt);
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
				const amountInDollars = (finalAmt / 100).toFixed(2);
				const hoursWorked = parseFloat(String(overridden.totalHoursWorked ?? 0));
				const effectiveRateDollars = effectiveRate ?? 0;

				await createPaperInvoiceRecord(
					{
						clientId: overridden.associatedClientId,
						amountInDollars,
						sourceType: 'timesheet',
						timesheetId: overridden.id,
						requisitionId: overridden.requisitionId ?? undefined,
						candidateId: overridden.associatedCandidateId,
						description: `Dental Temp Staffing Solutions invoice: Hours worked for timesheet ${id}`,
						lineItems: [
							{
								id: crypto.randomUUID(),
								description: `Hours worked for timesheet ${id}`,
								quantity: hoursWorked,
								rate: Math.round(effectiveRateDollars * 100),
								unit_amount: Math.round(effectiveRateDollars * 100),
								unit_amount_excluding_tax: Math.round(effectiveRateDollars * 100),
								amount: Math.round(parseFloat(amountInDollars) * 100),
								currency: 'usd',
								type: 'paper'
							}
						]
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
					[{ amountInCents: finalAmt, description: `Invoice for timesheet ${id}` }],
					{ userId: user.id, timesheetId: overridden.id },
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
	}
};
