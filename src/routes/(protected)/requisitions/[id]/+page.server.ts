import type { PageServerLoad, RequestEvent } from './$types';
import {
	changeRequisitionStatus,
	updateRequisition,
	createNewRecurrenceDay,
	deleteRecurrenceDay,
	editRecurrenceDay,
	getCompanyByRequisitionIdAdmin,
	getRecurrenceDaysForRequisition,
	getRequisitionApplications,
	getRequisitionDetailsById,
	getRequisitionTimesheets,
	getRequisitionDetailsByIdAdmin,
	closeAllUpcomingRecurrenceDays,
	createInvoiceRecord,
	createPaperInvoiceRecord
} from '$lib/server/database/queries/requisitions';
import { createStripeInvoice } from '$lib/server/stripe';
import { assertCanAccessLocation } from '$lib/server/scoping';
import { z } from 'zod';
import { fail, redirect } from '@sveltejs/kit';
import { message, setError, superValidate } from 'sveltekit-superforms/server';
import {
	editRecurrenceDaySchema,
	newRecurrenceDaySchema,
	deleteRecurrenceDaySchema,
	changeStatusSchema
} from '$lib/config/zod-schemas';
import { USER_ROLES } from '$lib/config/constants';
import {
	getAllClientLocationsByCompanyId,
	getClientCompanyByClientId,
	getClientIdByCompanyId,
	getClientProfileById,
	getClientProfileByStaffUserId,
	getClientProfilebyUserId,
	getClientStaffProfilebyUserId,
	getClientSubscription,
	getLocationByIdForCompany
} from '$lib/server/database/queries/clients';
import { getClientProfileByIdAdmin } from '$lib/server/database/queries/admin';
import type { ClientCompanyStaffProfile } from '$lib/server/database/schemas/client';
import {
	convertRecurrenceDayToUTC,
	getUserTimezone,
	dueDateEndOfDayInTimezone
} from '$lib/_helpers/UTCTimezoneUtils';
import { setFlash } from 'sveltekit-flash-message/server';
import { redirectIfNotValidCustomer } from '$lib/server/database/queries/billing';
import { getAllDisciplines } from '$lib/server/database/queries/disciplines';
import { getAllExperienceLevels } from '$lib/server/database/queries/skills';
import {
	notifyRequisitionCancelled,
	notifyRequisitionChanged,
	notifyQualifiedCandidatesOfNewWorkdays,
	notifyWorkdayChanged,
	notifyWorkdayDeleted
} from '$lib/server/notifications/transactional';
import db from '$lib/server/database/drizzle';
import { eq } from 'drizzle-orm';
import { workdayTable, recurrenceDayTable } from '$lib/server/database/schemas/requisition';
import { logger } from '$lib/server/logger';

const invoiceLineItemSchema = z.array(
	z.object({
		description: z.string().optional(),
		amount: z.number().min(0, 'Item amount must be a positive number'),
		quantity: z.any().transform((val) => {
			const parsed = parseInt(val, 10);
			if (isNaN(parsed) || parsed <= 0) {
				throw new Error('Item quantity must be a positive integer');
			}
			return parsed;
		}),
		rate: z.string().transform((val) => {
			const parsed = parseFloat(val);
			if (isNaN(parsed) || parsed < 0) {
				throw new Error('Item rate must be a non-negative number');
			}
			return parsed;
		})
	})
);

const requisitionInvoiceSchema = z.object({
	amount: z.number().min(0, 'Amount must be a positive number'),
	dueDate: z.string().optional(),
	description: z.string().optional(),
	invoiceMethod: z.enum(['STRIPE', 'PAPER']).default('PAPER'),
	items: z.string().transform((val) => {
		try {
			return JSON.parse(val);
		} catch {
			return [];
		}
	})
});

export const load: PageServerLoad = async (event: RequestEvent) => {
	const user = event.locals.user;

	if (!user) {
		redirect(302, '/auth/sign-in');
	}

	const { id } = event.params;
	const idAsNum = Number(id);
	const recurrenceDayForm = await superValidate(event, newRecurrenceDaySchema);
	const changeStatusForm = await superValidate(event, changeStatusSchema);
	const editRecurrenceDayForm = await superValidate(event, editRecurrenceDaySchema);
	const deleteRecurrenceDayForm = await superValidate(event, deleteRecurrenceDaySchema);
	const invoiceForm = await superValidate(requisitionInvoiceSchema);

	if (user.role === USER_ROLES.SUPERADMIN) {
		const company = await getCompanyByRequisitionIdAdmin(idAsNum);
		const requisition = await getRequisitionDetailsByIdAdmin(idAsNum);
		const requisitionApplications = await getRequisitionApplications(idAsNum);
		const requisitionTimesheets = await getRequisitionTimesheets(idAsNum);
		const requisitionRecurrenceDays = await getRecurrenceDaysForRequisition(idAsNum);
		const disciplines = await getAllDisciplines();
		const experienceLevels = await getAllExperienceLevels();
		const locations = await getAllClientLocationsByCompanyId(company.id);

		const location = await getLocationByIdForCompany(
			requisition.requisition.location.id,
			company.id
		);

		// Surface the client's preferred billing method so the Create Invoice
		// dialog defaults to it rather than always to PAPER.
		const clientProfile = await getClientProfileByIdAdmin(company.clientId);

		return {
			user,
			hasRequisitionRights: true,
			changeStatusForm,
			recurrenceDayForm,
			editRecurrenceDayForm,
			deleteRecurrenceDayForm,
			invoiceForm,
			company: company,
			location,
			requisition: requisition.requisition || null,
			recurrenceDays: requisitionRecurrenceDays || [],
			applications: requisitionApplications || [],
			timesheets: requisitionTimesheets || [],
			disciplines,
			experienceLevels,
			locations,
			clientInvoiceMethod: clientProfile?.clientInvoiceMethod ?? 'STRIPE'
		};
	}

	if (user.role === USER_ROLES.CLIENT) {
		if (!user.completedOnboarding) {
			redirect(302, '/onboarding/client/company');
		}
		const client = await getClientProfilebyUserId(user.id);

		await redirectIfNotValidCustomer(client.id, user.role);

		const company = await getClientCompanyByClientId(client.id);
		const result = await getRequisitionDetailsById(idAsNum);
		const requisitionApplications = await getRequisitionApplications(idAsNum);
		const requisitionTimesheets = await getRequisitionTimesheets(idAsNum);
		const requisitionRecurrenceDays = await getRecurrenceDaysForRequisition(idAsNum);
		const location = await getLocationByIdForCompany(result.requisition.location.id, company.id);
		const disciplines = await getAllDisciplines();
		const experienceLevels = await getAllExperienceLevels();
		const locations = await getAllClientLocationsByCompanyId(company.id);

		const hasRequisitionRights = true;

		return {
			user,
			company,
			location,
			hasRequisitionRights,
			changeStatusForm,
			recurrenceDayForm,
			editRecurrenceDayForm,
			deleteRecurrenceDayForm,
			invoiceForm,
			requisition: result?.requisition ?? null,
			recurrenceDays: requisitionRecurrenceDays || [],
			applications: requisitionApplications || [],
			timesheets: requisitionTimesheets || [],
			disciplines,
			experienceLevels,
			locations,
			clientInvoiceMethod: client?.clientInvoiceMethod ?? 'STRIPE'
		};
	}
	if (user.role === USER_ROLES.CLIENT_STAFF) {
		const client = await getClientProfileByStaffUserId(user.id);

		await redirectIfNotValidCustomer(client?.id, user.role);

		const profile: ClientCompanyStaffProfile | null = await getClientStaffProfilebyUserId(user.id);
		const company = await getClientCompanyByClientId(client?.id);
		const result = await getRequisitionDetailsById(idAsNum);
		// Access guard: staff must be assigned to this requisition's location.
		await assertCanAccessLocation(user, result?.requisition?.location?.id);
		const requisitionApplications = await getRequisitionApplications(idAsNum);
		const requisitionTimesheets = await getRequisitionTimesheets(idAsNum);
		const requisitionRecurrenceDays = await getRecurrenceDaysForRequisition(idAsNum);
		const location = await getLocationByIdForCompany(result.requisition.location.id, company.id);
		const disciplines = await getAllDisciplines();
		const experienceLevels = await getAllExperienceLevels();
		const locations = await getAllClientLocationsByCompanyId(company.id);

		const hasRequisitionRights =
			profile?.staffRole === 'CLIENT_ADMIN' || profile?.staffRole === 'CLIENT_MANAGER';

		return {
			user,
			company,
			location,
			changeStatusForm,
			hasRequisitionRights,
			recurrenceDayForm,
			editRecurrenceDayForm,
			deleteRecurrenceDayForm,
			invoiceForm,
			requisition: result?.requisition ?? null,
			recurrenceDays: requisitionRecurrenceDays || [],
			applications: requisitionApplications || [],
			timesheets: requisitionTimesheets || [],
			disciplines,
			experienceLevels,
			locations,
			clientInvoiceMethod: client?.clientInvoiceMethod ?? 'STRIPE'
		};
	}
};

export const actions = {
	changeStatus: async (request: RequestEvent) => {
		const user = request.locals.user;
		if (!user) {
			return fail(403);
		}

		const form = await superValidate(request, changeStatusSchema);

		if (!form.valid) {
			fail(400, { form });
		}

		try {
			const requisitionId = form.data.requisitionId;
			const status = form.data.status;

			const values = {
				updatedAt: new Date(),
				status
			};

			// Closing or cancelling a requisition should also close any of its
			// still-OPEN upcoming recurrence days. Both updates run in one
			// transaction so partial failures roll back together.
			await db.transaction(async (tx) => {
				await changeRequisitionStatus(values, Number(requisitionId), user.id, tx);
				if (status === 'CANCELED' || status === 'CLOSED') {
					await closeAllUpcomingRecurrenceDays(Number(requisitionId), user.id, tx);
				}
			});

			// Notifications fire after the transaction commits — dispatcher swallows
			// its own failures, so the status change itself is unaffected.
			if (status === 'CANCELED') {
				await notifyRequisitionCancelled(Number(requisitionId));
			}

			setFlash(
				{
					type: 'success',
					message: 'Requisition status updated successfully'
				},
				request
			);
			return message(form, 'Status Updated');
		} catch (error) {
			console.log(error);
			setFlash(
				{
					type: 'error',
					message: 'Failed to update requisition status'
				},
				request
			);
			return setError(form, 'Something went wrong');
		}
	},
	addRecurrenceDays: async (event: RequestEvent) => {
		const user = event.locals.user;
		const { id } = event.params;
		const idAsNum = Number(id);
		if (!user) return fail(403);

		console.log('Processing addRecurrenceDays action for requisition ID:', idAsNum);

		const form = await superValidate(event, newRecurrenceDaySchema);
		console.log(form);
		if (!form.valid) {
			console.log(form);
			return fail(400, { form });
		}

		const requisition = await getRequisitionDetailsById(idAsNum);

		console.log('Fetched requisition details:', requisition);

		try {
			const daysToAdd = form.data.recurrenceDays;
			console.log('Received recurrence days:', daysToAdd);
			// Parse the recurrence days from the form data
			const created = await Promise.all(
				Array.isArray(daysToAdd) ? daysToAdd.map(processDay) : [processDay(daysToAdd)]
			);
			const newDayIds = created
				.map((row) => row?.id)
				.filter((id): id is string => typeof id === 'string');

			await notifyQualifiedCandidatesOfNewWorkdays(idAsNum, newDayIds);

			setFlash(
				{
					type: 'success',
					message: 'Recurrence days created successfully'
				},
				event
			);
			return { form, success: true };
		} catch (error) {
			setFlash(
				{
					type: 'error',
					message: 'Failed to create recurrence days'
				},
				event
			);
			console.error('Error creating recurrence days:', error);
			return { form, error: 'Failed to create recurrence days' };
		}

		// Helper function to process each day
		async function processDay(day: Record<string, any>) {
			// Convert the day to UTC format
			const utcDay = convertRecurrenceDayToUTC(day, requisition.requisition.referenceTimezone);

			console.log('utc day data', utcDay);

			const values = {
				id: crypto.randomUUID(),
				createdAt: new Date(),
				updatedAt: new Date(),
				requisitionId: Number(utcDay.requisitionId),
				date: utcDay.date, // UTC date as string
				dayStart: utcDay.dayStart, // JavaScript Date object for timestamp
				dayEnd: utcDay.dayEnd,
				lunchStart: utcDay.lunchStart,
				lunchEnd: utcDay.lunchEnd,
				archived: false
			};

			console.log('values gping into db', values);

			return createNewRecurrenceDay(values, user!.id);
		}
	},
	editRecurrenceDay: async (request: RequestEvent) => {
		const user = request.locals.user;
		if (!user) {
			return fail(403);
		}
		const form = await superValidate(request, editRecurrenceDaySchema);

		if (!form.valid) {
			fail(400, { form });
		}

		try {
			const id = form.data.id;
			const requisitionId = form.data.requisitionId;
			const date = form.data.date;
			const dayStartTime = form.data.dayStartTime;
			const dayEndTime = form.data.dayEndTime;
			const lunchStartTime = form.data.lunchStartTime;
			const lunchEndTime = form.data.lunchEndTime;

			if (
				!requisitionId.length ||
				date.length ||
				dayStartTime.length ||
				dayEndTime.length ||
				lunchStartTime.length ||
				lunchEndTime.length
			) {
				fail(400, { form });
			}
			const requisition = await getRequisitionDetailsById(+requisitionId);
			const utcDay = convertRecurrenceDayToUTC(
				{ date, dayStartTime, dayEndTime, lunchEndTime, lunchStartTime, requisitionId },
				requisition.requisition.referenceTimezone
			);

			const values = {
				updatedAt: new Date(),
				requisitionId: Number(requisitionId),
				date: date,
				dayStart: utcDay.dayStart,
				dayEnd: utcDay.dayEnd,
				lunchStart: utcDay.lunchStart,
				lunchEnd: utcDay.lunchEnd
			};

			await editRecurrenceDay(id, values, user.id);
			await notifyWorkdayChanged(id);

			setFlash(
				{
					type: 'success',
					message: 'Recurrence day edited successfully'
				},
				request
			);

			return message(
				{
					...form,
					data: {
						id,
						requisitionId: requisitionId,
						date: '',
						dayStartTime: '',
						dayEndTime: '',
						lunchStartTime: '',
						lunchEndTime: ''
					}
				},
				'Edited Recurrence Day'
			);
		} catch (error) {
			console.error(error);
			setFlash(
				{
					type: 'error',
					message: 'Failed to edit recurrence day'
				},
				request
			);
			return setError(form, 'Something went wrong');
		}
	},
	deleteRecurrenceDay: async (request: RequestEvent) => {
		const user = request.locals.user;
		if (!user) {
			return fail(403);
		}

		const form = await superValidate(request, deleteRecurrenceDaySchema);

		if (!form.valid) {
			fail(400, { form });
		}

		try {
			const id = form.data.id;

			if (!id.length) {
				fail(400, { form });
			}

			// Snapshot the assigned candidate (if any) and the recurrence day's
			// time/date BEFORE the delete cascade, so the dispatcher can email the
			// candidate after the rows are gone.
			const [snapshot] = await db
				.select({
					candidateId: workdayTable.candidateId,
					requisitionId: workdayTable.requisitionId,
					date: recurrenceDayTable.date,
					dayStart: recurrenceDayTable.dayStart,
					dayEnd: recurrenceDayTable.dayEnd
				})
				.from(recurrenceDayTable)
				.leftJoin(workdayTable, eq(workdayTable.recurrenceDayId, recurrenceDayTable.id))
				.where(eq(recurrenceDayTable.id, id))
				.limit(1);

			await deleteRecurrenceDay(id, user.id);

			if (snapshot && snapshot.candidateId && snapshot.requisitionId !== null) {
				await notifyWorkdayDeleted({
					candidateId: snapshot.candidateId,
					requisitionId: snapshot.requisitionId,
					recurrenceDay: {
						date: snapshot.date,
						dayStart: snapshot.dayStart,
						dayEnd: snapshot.dayEnd
					}
				});
			}

			setFlash(
				{
					type: 'success',
					message: 'Recurrence day deleted successfully'
				},
				request
			);

			return message(form, 'Deleted Recurrence Day');
		} catch (error) {
			console.error(error);
			setFlash(
				{
					type: 'error',
					message: 'Failed to delete recurrence day'
				},
				request
			);
			return setError(form, 'Something went wrong');
		}
	},
	createInvoice: async (event: RequestEvent) => {
		const user = event.locals.user;
		if (!user) {
			return fail(403, { error: 'Not authenticated' });
		}

		if (![USER_ROLES.SUPERADMIN, 'CLIENT', 'CLIENT_STAFF'].includes(user.role)) {
			return fail(403, { error: 'Not authorized to create invoices' });
		}

		const { id } = event.params;
		const requisitionId = Number(id);
		const form = await superValidate(event, requisitionInvoiceSchema);

		if (!form.valid) {
			return fail(400, { form });
		}

		try {
			const requisition = (await getRequisitionDetailsById(requisitionId))?.requisition;
			if (!requisition) {
				return setError(form, 'Requisition not found');
			}
			if (!requisition.permanentPosition) {
				return setError(form, 'Invoices can only be created against permanent requisitions');
			}

			const lineItems = await invoiceLineItemSchema.parseAsync(form.data.items);
			const clientId = await getClientIdByCompanyId(requisition.companyId);
			const clientResult = await getClientProfileById(clientId);
			const customerName = `${clientResult.user.firstName} ${clientResult.user.lastName}`;
			const customerEmail = clientResult.user.email;

			if (form.data.invoiceMethod === 'PAPER') {
				await createPaperInvoiceRecord(
					{
						clientId,
						amountInDollars: form.data.amount.toFixed(2),
						dueDate: form.data.dueDate,
						description: form.data.description,
						requisitionId,
						sourceType: 'other',
						lineItems: lineItems.map((item) => ({
							id: crypto.randomUUID(),
							description: item.description ?? null,
							quantity: item.quantity,
							rate: item.rate,
							unit_amount: Math.round(item.rate * 100),
							unit_amount_excluding_tax: Math.round(item.rate * 100),
							amount: Math.round(item.amount * 100),
							currency: 'usd',
							type: 'paper' as const
						})),
						customerEmail,
						customerName
					},
					user.id
				);
			} else {
				const stripeCustomerId = await getClientSubscription(clientId);
				if (!stripeCustomerId) {
					return setError(form, 'Stripe customer not configured for this client');
				}
				// End-of-day in the business timezone keeps "due today" picks safely
				// in the future when the admin is west of UTC at submit time.
				const dueDate = dueDateEndOfDayInTimezone(form.data.dueDate)?.toISOString();
				const stripeInvoice = await createStripeInvoice(
					stripeCustomerId,
					lineItems.map((item) => ({
						amountInCents: Math.round(item.amount * 100),
						description: item.description || '',
						quantity: item.quantity || 1,
						currency: 'usd'
					})),
					{ clientId, userId: clientResult.user.id, requisitionId: String(requisitionId) },
					form.data.description,
					dueDate
				);
				await createInvoiceRecord(
					{
						clientId,
						stripeInvoice,
						amountInDollars: (stripeInvoice.amount_due / 100).toFixed(2),
						requisitionId,
						sourceType: 'other'
					},
					user.id
				);
			}

			setFlash({ type: 'success', message: 'Invoice created successfully' }, event);
			return message(form, 'Invoice created successfully');
		} catch (err) {
			logger.error('requisition create invoice failed', {
				error: err,
				requisitionId,
				distinctId: user?.id
			});
			setFlash({ type: 'error', message: 'Failed to create invoice' }, event);
			return setError(form, 'Failed to create invoice');
		}
	},
	updateRequisition: async (event: RequestEvent) => {
		const user = event.locals.user;
		if (!user) return fail(403);

		const { id } = event.params;
		const idAsNum = Number(id);
		const formData = await event.request.formData();

		const disciplineId = formData.get('disciplineId') as string;
		const rawExperienceLevelId = formData.get('experienceLevelId');
		const experienceLevelId =
			rawExperienceLevelId && rawExperienceLevelId !== '' ? (rawExperienceLevelId as string) : null;
		const hourlyRate = Number(formData.get('hourlyRate'));
		const jobDescription = formData.get('jobDescription') as string;
		const specialInstructions = formData.get('specialInstructions') as string | null;
		const purchaseOrderNumber = formData.get('purchaseOrderNumber') as string;

		try {
			await updateRequisition(
				idAsNum,
				{
					disciplineId,
					experienceLevelId,
					hourlyRate,
					jobDescription,
					specialInstructions,
					purchaseOrderNumber
				},
				user.id
			);

			await notifyRequisitionChanged(idAsNum);

			setFlash({ type: 'success', message: 'Requisition updated successfully' }, event);
			return { success: true };
		} catch (err) {
			console.error('Error updating requisition:', err);
			setFlash({ type: 'error', message: 'Failed to update requisition' }, event);
			return fail(500, { error: 'Failed to update requisition' });
		}
	}
	// deleteRequisition: async (request: RequestEvent) => {
	// 	const user = request.locals.user;
	// 	if (!user) {
	// 		return fail(403);
	// 	}

	// 	const form = await superValidate(request, changeStatusSchema);

	// 	if (!form.valid) {
	// 		fail(400, { form });
	// 	}

	// 	try {
	// 		const requisitionId = form.data.requisitionId;

	// 		await deleteRequisition(requisitionId, user.id);

	// 		setFlash(
	// 			{
	// 				type: 'success',
	// 				message: 'Requisition deleted successfully'
	// 			},
	// 			request
	// 		);
	// 		return message(form, 'Requisition Deleted');
	// 	} catch (error) {
	// 		console.error(error);
	// 		setFlash(
	// 			{
	// 				type: 'error',
	// 				message: 'Failed to delete requisition'
	// 			},
	// 			request
	// 		);
	// 		return setError(form, 'Something went wrong');
	// 	}
	// }
};
