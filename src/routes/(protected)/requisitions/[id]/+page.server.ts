import type { PageServerLoad, RequestEvent } from './$types';
import {
	changeRequisitionStatus,
	updateRequisition,
	findOrReuseRecurrenceDay,
	deleteRecurrenceDay,
	editRecurrenceDay,
	getCompanyByRequisitionIdAdmin,
	getRecurrenceDaysWithAssignmentsForRequisition,
	getRequisitionApplications,
	getRequisitionDetailsById,
	getRequisitionTimesheets,
	getRequisitionDetailsByIdAdmin,
	closeAllUpcomingRecurrenceDays,
	createInvoiceRecord,
	createPaperInvoiceRecord,
	linkWorkdayToOpenTimesheet
} from '$lib/server/database/queries/requisitions';
import { createStripeInvoice, withCardProcessingFee } from '$lib/server/stripe';
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
import { getQualifiedProfessionalsForRequisition } from '$lib/server/database/queries/candidates';
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
	notifyCandidateAssignedToWorkdays,
	notifyWorkdayChanged,
	notifyWorkdayDeleted,
	notifyInvoiceCreated
} from '$lib/server/notifications/transactional';
import { resolveBillingRecipient } from '$lib/server/billing/recipients';
import db from '$lib/server/database/drizzle';
import { eq, inArray } from 'drizzle-orm';
import { workdayTable, recurrenceDayTable } from '$lib/server/database/schemas/requisition';
import { logger } from '$lib/server/logger';
import {
	isValidIanaTimezone,
	setRequisitionReferenceTimezone
} from '$lib/server/requisitions/referenceTimezone';
import {
	cancelRecurrenceDayAsActor,
	cancelRecurrenceDayInTx,
	notifyCancelledWorkday,
	type CancelRecurrenceDaySnapshot
} from '$lib/server/requisitions/cancelRecurrenceDay';
import type { CancellationRole } from '$lib/server/cancellations';

const invoiceLineItemSchema = z.array(
	z.object({
		description: z.string().optional(),
		amount: z.number().min(0, 'Item amount must be a positive number'),
		quantity: z.any().transform((val) => {
			// Fractional quantities are allowed (e.g. 1.5 hrs) — Stripe bills them via
			// quantity_decimal. Must still be a positive number.
			const parsed = parseFloat(val);
			if (isNaN(parsed) || parsed <= 0) {
				throw new Error('Item quantity must be a positive number');
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
		const requisitionRecurrenceDays = await getRecurrenceDaysWithAssignmentsForRequisition(idAsNum);
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

		// Admin-only: qualified candidates near this requisition's location, used
		// by the Add Shifts drawer to optionally assign a pro on creation.
		const qualifiedProfessionals = await getQualifiedProfessionalsForRequisition(
			requisition.requisition,
			location
		);

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
			qualifiedProfessionals,
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
		const requisitionRecurrenceDays = await getRecurrenceDaysWithAssignmentsForRequisition(idAsNum);
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
		const requisitionRecurrenceDays = await getRecurrenceDaysWithAssignmentsForRequisition(idAsNum);
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

		// Payment-tracking statuses are admin-only. The UI hides them from clients,
		// but enforce here too in case of direct POST.
		if (
			(form.data.status === 'PAYMENT_REQUIRED' || form.data.status === 'PAYMENT_RECEIVED') &&
			user.role !== USER_ROLES.SUPERADMIN
		) {
			return fail(403, { form });
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

		// Read the body once so we can pull the optional admin `candidateId` field
		// alongside the validated recurrence-day payload.
		const formData = await event.request.formData();
		// Direct-assign is admin-only: a qualified candidate gets dropped onto the
		// new day(s), which are created FILLED instead of OPEN.
		const candidateId =
			user.role === USER_ROLES.SUPERADMIN
				? (formData.get('candidateId') as string | null) || null
				: null;
		const assigning = !!candidateId;

		const form = await superValidate(formData, newRecurrenceDaySchema);
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
			// Skip days that were a no-op reuse (the date already had an active
			// OPEN/FILLED row) — they get no new workday and no notification.
			const actionableDays = created
				.filter((c): c is NonNullable<typeof c> => !!c?.row?.id)
				.filter((c) => c.outcome !== 'noop-active')
				.map((c) => c.row);
			const newDayIds = actionableDays.map((row) => row.id);

			if (assigning && newDayIds.length > 0) {
				// Create one workday per new/reopened day, linking the candidate. Days
				// were already created FILLED above. One transaction so a partial
				// failure rolls back the whole assignment.
				await db.transaction(async (tx) => {
					for (const day of actionableDays) {
						const workdayId = crypto.randomUUID();
						await tx.insert(workdayTable).values({
							id: workdayId,
							candidateId: candidateId!,
							requisitionId: idAsNum,
							recurrenceDayId: day.id,
							createdAt: new Date(),
							updatedAt: new Date()
						});

						// Attach to the candidate's open timesheet for this requisition+week
						// immediately, so days added later in (or after) the week land on
						// the same timesheet instead of fragmenting into a second one.
						await linkWorkdayToOpenTimesheet(tx, {
							workdayId,
							candidateId: candidateId!,
							requisitionId: idAsNum,
							dayStart: day.dayStart,
							referenceTimezone: requisition.requisition.referenceTimezone
						});
					}
				});

				// ONE notification to the assigned candidate (email + SMS) instead of
				// the blast-all-qualified notification used for open days.
				await notifyCandidateAssignedToWorkdays({
					candidateId: candidateId!,
					requisitionId: idAsNum,
					recurrenceDayIds: newDayIds
				});
			} else {
				await notifyQualifiedCandidatesOfNewWorkdays(idAsNum, newDayIds);
			}

			setFlash(
				{
					type: 'success',
					message: assigning
						? 'Workdays created and professional assigned successfully'
						: 'Recurrence days created successfully'
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
				// Direct admin assignment skips the OPEN stage — the day is spoken for.
				status: assigning ? ('FILLED' as const) : ('OPEN' as const),
				archived: false
			};

			console.log('values gping into db', values);

			return findOrReuseRecurrenceDay(values, user!.id);
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
			// Invoices address the billing contact, not the account owner's login
			// email; the resolver falls back to the owner when none is set.
			const billingRecipient = await resolveBillingRecipient(clientId);
			const customerName =
				billingRecipient?.name ?? `${clientResult.user.firstName} ${clientResult.user.lastName}`;
			const customerEmail = billingRecipient?.email ?? clientResult.user.email;

			if (form.data.invoiceMethod === 'PAPER') {
				const paperInvoice = await createPaperInvoiceRecord(
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

				if (paperInvoice?.id) {
					await notifyInvoiceCreated({
						invoiceId: paperInvoice.id,
						dueDate: paperInvoice.dueDate
					});
				}
			} else {
				const stripeCustomerId = await getClientSubscription(clientId);
				if (!stripeCustomerId) {
					return setError(form, 'Stripe customer not configured for this client');
				}
				// End-of-day in the business timezone keeps "due today" picks safely
				// in the future when the admin is west of UTC at submit time.
				const dueDate = dueDateEndOfDayInTimezone(form.data.dueDate)?.toISOString();
				// Adds a card processing fee (3%) for card-paying clients.
				const invoiceLineItems = await withCardProcessingFee(
					stripeCustomerId,
					lineItems.map((item) => ({
						amountInCents: Math.round(item.amount * 100),
						description: item.description || '',
						quantity: item.quantity || 1,
						unitAmountInCents: Math.round(item.rate * 100),
						currency: 'usd'
					}))
				);
				const stripeInvoice = await createStripeInvoice(
					stripeCustomerId,
					invoiceLineItems,
					{ clientId, userId: clientResult.user.id, requisitionId: String(requisitionId) },
					form.data.description,
					dueDate
				);
				const invoiceRow = await createInvoiceRecord(
					{
						clientId,
						stripeInvoice,
						amountInDollars: (stripeInvoice.amount_due / 100).toFixed(2),
						requisitionId,
						sourceType: 'other'
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
	},
	// Manual override for a requisition whose reference timezone is wrong —
	// normally it follows the location (see syncRequisitionTimezonesForLocation),
	// but rows created before that sync existed need a direct correction.
	// Upcoming shifts are re-based so their local start/end times don't move.
	updateReferenceTimezone: async (event: RequestEvent) => {
		const user = event.locals.user;
		if (!user) return fail(403);
		if (user.role !== USER_ROLES.SUPERADMIN) {
			return fail(403, { error: 'Not authorized' });
		}

		const { id } = event.params;
		const requisitionId = Number(id);
		const formData = await event.request.formData();
		const timezone = (formData.get('referenceTimezone') as string | null)?.trim();

		if (!isValidIanaTimezone(timezone)) {
			setFlash({ type: 'error', message: 'Invalid timezone' }, event);
			return fail(400, { error: 'Invalid timezone' });
		}

		try {
			const change = await setRequisitionReferenceTimezone({
				requisitionId,
				timezone,
				actorUserId: user.id
			});

			setFlash(
				{
					type: 'success',
					message: change
						? `Timezone set to ${timezone}. Re-based ${change.daysRewritten} upcoming shift${
								change.daysRewritten === 1 ? '' : 's'
							} — local start/end times unchanged.`
						: `Requisition already uses ${timezone}.`
				},
				event
			);
			return { success: true };
		} catch (err) {
			logger.error('failed to set requisition reference timezone', {
				error: err,
				requisitionId,
				timezone,
				distinctId: user.id
			});
			setFlash({ type: 'error', message: 'Failed to update timezone' }, event);
			return fail(500, { error: 'Failed to update timezone' });
		}
	},
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
	// Per-row cancel from the Workdays tab's action menu. Delegates to the same
	// helper the workday detail page and the bulk cancel use, so the audit row,
	// timesheet strip and candidate notification are identical regardless of
	// which surface the cancel came from.
	cancelRecurrenceDay: async (request: RequestEvent) => {
		const user = request.locals.user;
		if (!user) return fail(403);
		if (![USER_ROLES.SUPERADMIN, 'CLIENT', 'CLIENT_STAFF'].includes(user.role)) {
			return fail(403, { error: 'Not authorized' });
		}

		const formData = await request.request.formData();
		const recurrenceDayId = (formData.get('recurrenceDayId') as string | null)?.trim();
		if (!recurrenceDayId) return fail(400, { error: 'Missing workday id' });

		try {
			await cancelRecurrenceDayAsActor({
				recurrenceDayId,
				actorUserId: user.id,
				actorRole: user.role as CancellationRole
			});
			setFlash({ type: 'success', message: 'Workday cancelled' }, request);
			return { success: true };
		} catch (err) {
			logger.error('requisition cancel recurrence day failed', {
				error: err,
				recurrenceDayId
			});
			setFlash({ type: 'error', message: 'Failed to cancel workday' }, request);
			return fail(500, { error: 'Failed to cancel workday' });
		}
	},
	// Bulk status change for selected workdays (OPEN / FILLED / UNFULFILLED only —
	// CANCELED has its own action so notifications + audit fire correctly).
	bulkUpdateRecurrenceDayStatus: async (request: RequestEvent) => {
		const user = request.locals.user;
		if (!user) return fail(403);

		const formData = await request.request.formData();
		const idsCsv = (formData.get('ids') as string | null) ?? '';
		const status = formData.get('status') as string | null;
		const ids = idsCsv
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
		if (ids.length === 0) return fail(400, { error: 'No workdays selected' });
		if (status !== 'OPEN' && status !== 'FILLED' && status !== 'UNFULFILLED') {
			return fail(400, { error: 'Invalid status for bulk update' });
		}

		await db
			.update(recurrenceDayTable)
			.set({ status, updatedAt: new Date() })
			.where(inArray(recurrenceDayTable.id, ids));

		setFlash(
			{
				type: 'success',
				message: `${ids.length} workday${ids.length === 1 ? '' : 's'} updated to ${status}`
			},
			request
		);
		return { success: true };
	},
	// Bulk cancel. Available to admin + client. Each day goes through the same
	// shared helper the per-row and workday-detail cancels use, so the audit row,
	// timesheet strip and orphan-sheet sweep happen here too — this action used
	// to skip all three.
	bulkCancelRecurrenceDays: async (request: RequestEvent) => {
		const user = request.locals.user;
		if (!user) return fail(403);

		const formData = await request.request.formData();
		const idsCsv = (formData.get('ids') as string | null) ?? '';
		const ids = idsCsv
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
		if (ids.length === 0) return fail(400, { error: 'No workdays selected' });

		// One transaction for the whole batch: either every day cancels or none
		// does, so we never leave half the selection audited and half not.
		const snapshots = await db.transaction(async (tx) => {
			const collected: CancelRecurrenceDaySnapshot[] = [];
			for (const id of ids) {
				collected.push(
					await cancelRecurrenceDayInTx(tx, {
						recurrenceDayId: id,
						actorUserId: user.id,
						actorRole: user.role as CancellationRole
					})
				);
			}
			return collected;
		});

		// Notifications fire after the tx commits. The dispatcher swallows its own
		// failures, so partial delivery doesn't roll back the cancel.
		for (const snapshot of snapshots) {
			await notifyCancelledWorkday(snapshot);
		}

		setFlash(
			{ type: 'success', message: `${ids.length} workday${ids.length === 1 ? '' : 's'} canceled` },
			request
		);
		return { success: true };
	},
	// Bulk delete. Admin-only — clients should cancel, not delete.
	bulkDeleteRecurrenceDays: async (request: RequestEvent) => {
		const user = request.locals.user;
		if (!user) return fail(403);
		if (user.role !== USER_ROLES.SUPERADMIN) return fail(403, { error: 'Admin only' });

		const formData = await request.request.formData();
		const idsCsv = (formData.get('ids') as string | null) ?? '';
		const ids = idsCsv
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
		if (ids.length === 0) return fail(400, { error: 'No workdays selected' });

		const snapshots = await db
			.select({
				recurrenceDayId: recurrenceDayTable.id,
				candidateId: workdayTable.candidateId,
				requisitionId: workdayTable.requisitionId,
				date: recurrenceDayTable.date,
				dayStart: recurrenceDayTable.dayStart,
				dayEnd: recurrenceDayTable.dayEnd
			})
			.from(recurrenceDayTable)
			.leftJoin(workdayTable, eq(workdayTable.recurrenceDayId, recurrenceDayTable.id))
			.where(inArray(recurrenceDayTable.id, ids));

		// Reuse the per-row soft-delete helper so each delete is audit-logged.
		for (const id of ids) {
			await deleteRecurrenceDay(id, user.id);
		}

		for (const s of snapshots) {
			if (s.candidateId && s.requisitionId !== null) {
				await notifyWorkdayDeleted({
					candidateId: s.candidateId,
					requisitionId: s.requisitionId,
					recurrenceDay: { date: s.date, dayStart: s.dayStart, dayEnd: s.dayEnd }
				});
			}
		}

		setFlash(
			{ type: 'success', message: `${ids.length} workday${ids.length === 1 ? '' : 's'} deleted` },
			request
		);
		return { success: true };
	}
};
