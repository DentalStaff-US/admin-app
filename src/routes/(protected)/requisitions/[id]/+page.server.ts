import type { PageServerLoad, RequestEvent } from './$types';
import {
	changeRequisitionStatus,
	createNewRecurrenceDay,
	deleteRecurrenceDay,
	editRecurrenceDay,
	getCompanyByRequisitionIdAdmin,
	getRecurrenceDaysForRequisition,
	getRequisitionApplications,
	getRequisitionDetailsById,
	getRequisitionTimesheets,
	getRequisitionDetailsForAdmin,
	getRequisitionDetailsByIdAdmin,
	closeAllUpcomingRecurrenceDays
} from '$lib/server/database/queries/requisitions';
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
	getClientCompanyByClientId,
	getClientProfileByStaffUserId,
	getClientProfilebyUserId,
	getClientStaffProfilebyUserId,
	getLocationByIdForCompany
} from '$lib/server/database/queries/clients';
import type { ClientCompanyStaffProfile } from '$lib/server/database/schemas/client';
import { convertRecurrenceDayToUTC, getUserTimezone } from '$lib/_helpers/UTCTimezoneUtils';
import { setFlash } from 'sveltekit-flash-message/server';
import { redirectIfNotValidCustomer } from '$lib/server/database/queries/billing';

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

	if (user.role === USER_ROLES.SUPERADMIN) {
		const company = await getCompanyByRequisitionIdAdmin(idAsNum);
		const requisition = await getRequisitionDetailsByIdAdmin(idAsNum);
		const requisitionApplications = await getRequisitionApplications(idAsNum);
		const requisitionTimesheets = await getRequisitionTimesheets(idAsNum);
		const requisitionRecurrenceDays = await getRecurrenceDaysForRequisition(idAsNum);
		const location = await getLocationByIdForCompany(
			requisition.requisition.location.id,
			company.id
		);

		return {
			user,
			hasRequisitionRights: true,
			changeStatusForm,
			recurrenceDayForm,
			editRecurrenceDayForm,
			deleteRecurrenceDayForm,
			company: company,
			location,
			requisition: requisition.requisition || null,
			recurrenceDays: requisitionRecurrenceDays || [],
			applications: requisitionApplications || [],
			timesheets: requisitionTimesheets || []
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
			requisition: result?.requisition ?? null,
			recurrenceDays: requisitionRecurrenceDays || [],
			applications: requisitionApplications || [],
			timesheets: requisitionTimesheets || []
		};
	}
	if (user.role === USER_ROLES.CLIENT_STAFF) {
		const client = await getClientProfileByStaffUserId(user.id);

		await redirectIfNotValidCustomer(client?.id, user.role);

		const profile: ClientCompanyStaffProfile | null = await getClientStaffProfilebyUserId(user.id);
		const company = await getClientCompanyByClientId(client?.id);
		const result = await getRequisitionDetailsById(idAsNum);
		const requisitionApplications = await getRequisitionApplications(idAsNum);
		const requisitionTimesheets = await getRequisitionTimesheets(idAsNum);
		const requisitionRecurrenceDays = await getRecurrenceDaysForRequisition(idAsNum);
		const location = await getLocationByIdForCompany(result.requisition.location.id, company.id);

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
			requisition: result?.requisition ?? null,
			recurrenceDays: requisitionRecurrenceDays || [],
			applications: requisitionApplications || [],
			timesheets: requisitionTimesheets || []
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

			await changeRequisitionStatus(values, Number(requisitionId), user.id);
			if (status === 'CANCELED') {
				await closeAllUpcomingRecurrenceDays(Number(requisitionId), user.id);
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
			await Promise.all(
				Array.isArray(daysToAdd) ? daysToAdd.map(processDay) : [processDay(daysToAdd)]
			);

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

			await deleteRecurrenceDay(id, user.id);
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
