import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
	clientCanCreateRequisitions,
	USER_ROLES,
	type ClientStatus
} from '$lib/config/constants';
import {
	addStaffToLocation,
	getAllClientStaffProfilesForLocation,
	getClientCompanyByClientId,
	getClientProfileByStaffUserId,
	getClientProfilebyUserId,
	getClientStaffProfilebyClientId,
	getLocationByIdForCompany,
	getStaffProfilesForLocation,
	updateCompanyLocation
} from '$lib/server/database/queries/clients';
import { getRequsitionsForLocation } from '$lib/server/database/queries/requisitions';
import { setError, superValidate } from 'sveltekit-superforms/server';
import { z } from 'zod';
import { setFlash } from 'sveltekit-flash-message/server';
import {
	OperatingHoursSchema,
	ClientLocationDetailsSchema,
	clientRequisitionSchema
} from '$lib/config/zod-schemas';
import { redirectIfNotValidCustomer } from '$lib/server/database/queries/billing';

const assignStaffToLocationSchema = z.object({
	staffId: z.string(),
	locationId: z.string(),
	companyId: z.string(),
	isPrimary: z.boolean()
});

export const load: PageServerLoad = async (event) => {
	const user = event.locals.user;
	const { id } = event.params;

	if (!user) {
		redirect(301, '/auth/sign-in');
	}

	if (user.role === USER_ROLES.SUPERADMIN) {
		redirect(301, '/dashboard');
	}

	const form = await superValidate(event, assignStaffToLocationSchema);
	const locationForm = await superValidate(event, ClientLocationDetailsSchema);
	const operatingHoursForm = await superValidate(event, OperatingHoursSchema);
	const clientForm = await superValidate(event, clientRequisitionSchema);

	if (user.role === USER_ROLES.CLIENT) {
		if (!user.completedOnboarding) {
			redirect(302, '/onboarding/client/company');
		}
		const client = await getClientProfilebyUserId(user.id);
		await redirectIfNotValidCustomer(client.id, user.role);

		const company = await getClientCompanyByClientId(client?.id);
		const location = await getLocationByIdForCompany(id, company.id);
		const requisitions = await getRequsitionsForLocation(location.id);
		const locationStaff = await getStaffProfilesForLocation(location.id);
		const staff = await getAllClientStaffProfilesForLocation(company.id, location.id);

		locationForm.data = {
			name: location.name || '',
			timezone: location.timezone || 'America/New_York',
			streetOne: location.streetOne || '',
			streetTwo: location.streetTwo || '',
			city: location.city || '',
			state: location.state || '',
			zipcode: location.zipcode || '',
			companyPhone: location.companyPhone || '',
			email: location.email || '',
			completeAddress: location.completeAddress || '',
			lat: parseFloat(location.lat as string),
			lon: parseFloat(location.lon as string)
		};
		operatingHoursForm.data = {
			operatingHours: JSON.stringify(location.operatingHours || {})
		};

		const clientStatus = (client?.status ?? 'PENDING') as ClientStatus;
		return {
			user: user,
			client: client || null,
			company: company || null,
			location: location || null,
			requisitions: requisitions || [],
			locationStaff: locationStaff || [],
			allStaff: staff || [],
			assignForm: form,
			locationForm,
			operatingHoursForm,
			clientForm,
			clientStatus,
			canCreateRequisitions: clientCanCreateRequisitions(clientStatus)
		};
	}
	if (user.role === USER_ROLES.CLIENT_STAFF) {
		const client = await getClientProfileByStaffUserId(user.id);
		await redirectIfNotValidCustomer(client?.id, user.role);
		const company = await getClientCompanyByClientId(client?.id);
		const location = await getLocationByIdForCompany(id, company.id);
		const requisitions = await getRequsitionsForLocation(location.id);
		const locationStaff = await getClientStaffProfilebyClientId(client?.id);
		const staff = await getAllClientStaffProfilesForLocation(company.id, location.id);

		locationForm.data = {
			name: location.name || '',
			timezone: location.timezone || 'America/New_York',
			streetOne: location.streetOne || '',
			streetTwo: location.streetTwo || '',
			city: location.city || '',
			state: location.state || '',
			zipcode: location.zipcode || '',
			companyPhone: location.companyPhone || '',
			email: location.email || '',
			completeAddress: location.completeAddress || '',
			lat: parseFloat(location.lat as string),
			lon: parseFloat(location.lon as string)
		};
		operatingHoursForm.data = {
			operatingHours: JSON.stringify(location.operatingHours || {})
		};
		const clientStatus = (client?.status ?? 'PENDING') as ClientStatus;
		return {
			user: user,
			client: client || null,
			company: company || null,
			location: location || null,
			requisitions: requisitions || [],
			locationStaff: locationStaff || [],
			allStaff: staff || [],
			assignForm: form,
			locationForm,
			operatingHoursForm,
			clientForm,
			clientStatus,
			canCreateRequisitions: clientCanCreateRequisitions(clientStatus)
		};
	}
};

export const actions = {
	assignStaff: async (event: RequestEvent) => {
		const currentUser = event.locals.user;

		if (!currentUser) {
			fail(401);
		}

		const form = await superValidate(event, assignStaffToLocationSchema);

		if (!form.valid) {
			fail(400, { form });
		}

		try {
			const values = {
				id: crypto.randomUUID(),
				companyId: form.data.companyId,
				staffId: form.data.staffId,
				locationId: form.data.locationId,
				isPrimary: form.data.isPrimary
			};

			await addStaffToLocation(values);
			setFlash(
				{
					type: 'success',
					message: 'Staff added to location successfully.'
				},
				event
			);
			return { form, success: true };
		} catch (e) {
			console.error(e);
			setFlash(
				{
					type: 'error',
					message: 'Error adding staff to location.'
				},
				event
			);
			return { form, success: false };
		}
	},
	updateLocationDetails: async (event) => {
		const user = event.locals.user;
		if (!user) {
			redirect(302, '/auth/sign-in');
		}
		const form = await superValidate(event, ClientLocationDetailsSchema);

		console.log(form);
		if (!form.valid) {
			return fail(400, { form });
		}
		const { id } = event.params;

		const { completeAddress, lat, lon, name, email, companyPhone, timezone } = form.data;

		const details = {
			completeAddress,
			lat: lat?.toString(),
			lon: lon?.toString(),
			timezone,
			companyPhone,
			email,
			name
		};

		try {
			await updateCompanyLocation(id, details);
			setFlash(
				{
					type: 'success',
					message: 'Location details updated successfully'
				},
				event
			);
			return { form };
		} catch (error) {
			console.error('Error updating location details:', error);
			setFlash(
				{
					type: 'error',
					message: 'Failed to update location details. Please try again.'
				},
				event
			);
			return { form };
		}
	},
	updateOperatingHours: async (event) => {
		const user = event.locals.user;
		if (!user) {
			redirect(302, '/auth/sign-in');
		}
		const form = await superValidate(event, OperatingHoursSchema);
		console.log('Operating hours form data:', form, form.data);

		if (!form.valid) {
			return fail(400, { form });
		}

		let jsonHours: Record<
			string,
			{ openTime: string; closeTime: string; isClosed: boolean; timezone: string }
		>;

		try {
			jsonHours = JSON.parse(form.data.operatingHours);
		} catch (error) {
			console.error('Invalid JSON format for operating hours:', error);
			setError(form, 'operatingHours', 'Invalid JSON format for operating hours');
			setFlash(
				{
					type: 'error',
					message: 'Invalid JSON format for operating hours'
				},
				event
			);
			return { form };
		}
		const { id } = event.params;

		try {
			console.log('Updating operating hours:', jsonHours);
			await updateCompanyLocation(id, { operatingHours: jsonHours });
			setFlash(
				{
					type: 'success',
					message: 'Operating hours updated successfully'
				},
				event
			);
			return { form };
		} catch (err) {
			console.error('Error updating operating hours:', err);
			setFlash(
				{
					type: 'error',
					message: 'Failed to update operating hours. Please try again.'
				},
				event
			);
			return { form };
		}
	}
};
