import {
	getClientProfileById,
	getLocationByIdForCompany,
	updateCompanyLocation
} from '$lib/server/database/queries/clients';
import { fail, redirect } from '@sveltejs/kit';
import { setError, superValidate } from 'sveltekit-superforms/server';
import type { PageServerLoad } from './$types';
import { setFlash } from 'sveltekit-flash-message/server';
import {
	ContactSchema,
	LocationSchema,
	NewAddressSchema,
	OperatingHoursSchema
} from '$lib/config/zod-schemas';
import { geocodingQueue } from '$lib/server/geocode-queue';
import { companyOfficeLocationTable } from '$lib/server/database/schemas/client';
import db from '$lib/server/database/drizzle';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async (event) => {
	const user = event.locals.user;
	if (!user) {
		redirect(302, '/auth/sign-in');
	}
	if (user.role !== 'SUPERADMIN') {
		redirect(302, '/dashboard');
	}
	const { id, locationId } = event.params;

	const client = await getClientProfileById(id);
	const location = await getLocationByIdForCompany(locationId, client?.company?.id);
	console.log(location);
	const addressForm = await superValidate(event, NewAddressSchema);
	const contactForm = await superValidate(event, ContactSchema);
	const operatingHoursForm = await superValidate(event, OperatingHoursSchema);
	const locationForm = await superValidate(event, LocationSchema);

	addressForm.data = {
		completeAddress: location.completeAddress || '',
		lat: parseFloat(location.lat || '0'),
		lon: parseFloat(location.lon || '0')
	};

	contactForm.data = {
		companyPhone: location.companyPhone || '',
		email: location.email || ''
	};

	operatingHoursForm.data = {
		operatingHours: JSON.stringify(location.operatingHours)
	};

	locationForm.data = {
		timezone: location.timezone || 'America/New_York'
	};

	return {
		user,
		client,
		location,
		addressForm,
		contactForm,
		operatingHoursForm,
		locationForm
	};
};

export const actions = {
	updateAddress: async (event) => {
		const user = event.locals.user;
		if (!user) {
			redirect(302, '/auth/sign-in');
		}
		const form = await superValidate(event, NewAddressSchema);

		if (!form.valid) {
			return fail(400, { form });
		}
		const { locationId } = event.params;

		const { completeAddress, lat, lon } = form.data;
		const addressData = {
			completeAddress,
			lat: lat.toString() || null,
			lon: lon.toString() || null
		};

		try {
			await updateCompanyLocation(locationId, addressData);
			setFlash(
				{
					type: 'success',
					message: 'Address updated successfully'
				},
				event
			);
			return { form };
		} catch (error) {
			console.error('Error updating address:', error);
			setFlash(
				{
					type: 'error',
					message: 'Failed to update address. Please try again.'
				},
				event
			);
			return { form };
		}
	},
	updateContactInfo: async (event) => {
		const user = event.locals.user;
		if (!user) {
			redirect(302, '/auth/sign-in');
		}
		const form = await superValidate(event, ContactSchema);
		if (!form.valid) {
			return fail(400, { form });
		}
		const { locationId } = event.params;
		const { companyPhone, email } = form.data;
		const contactData = {
			companyPhone: companyPhone || '',
			email: email || ''
		};
		try {
			await updateCompanyLocation(locationId, contactData);
			setFlash(
				{
					type: 'success',
					message: 'Contact information updated successfully'
				},
				event
			);
			return { form };
		} catch (error) {
			console.error('Error updating contact information:', error);
			setFlash(
				{
					type: 'error',
					message: 'Failed to update contact information. Please try again.'
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
		const { locationId } = event.params;

		try {
			await updateCompanyLocation(locationId, { operatingHours: jsonHours });
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
	},
	updateLocation: async (event) => {
		const user = event.locals.user;
		if (!user) {
			redirect(302, '/auth/sign-in');
		}
		const form = await superValidate(event, LocationSchema);
		if (!form.valid) {
			return fail(400, { form });
		}
		const { locationId } = event.params;
		const { timezone } = form.data;

		try {
			await updateCompanyLocation(locationId, {
				timezone
			});
			setFlash(
				{
					type: 'success',
					message: 'Location updated successfully'
				},
				event
			);
			return { form };
		} catch (error) {
			console.error('Error updating location:', error);
			setFlash(
				{
					type: 'error',
					message: 'Failed to update location. Please try again.'
				},
				event
			);
			return { form };
		}
	},
	geocodeLocation: async (event) => {
		const user = event.locals.user;
		if (!user || user.role !== 'SUPERADMIN') {
			redirect(302, '/auth/sign-in');
		}

		const { locationId } = event.params;

		try {
			// Get the location
			const location = await db
				.select({
					id: companyOfficeLocationTable.id,
					completeAddress: companyOfficeLocationTable.completeAddress,
					email: companyOfficeLocationTable.email,
					lat: companyOfficeLocationTable.lat,
					lon: companyOfficeLocationTable.lon
				})
				.from(companyOfficeLocationTable)
				.where(eq(companyOfficeLocationTable.id, locationId))
				.limit(1);

			if (!location[0]) {
				setFlash(
					{
						type: 'error',
						message: 'Location not found'
					},
					event
				);
				return fail(404, { error: 'Location not found' });
			}

			const loc = location[0];

			// Check if address exists
			if (!loc.completeAddress || !loc.completeAddress.trim()) {
				setFlash(
					{
						type: 'error',
						message: 'No address to geocode. Please add an address first.'
					},
					event
				);
				return fail(400, { error: 'No address available' });
			}

			// Queue the geocoding job
			geocodingQueue.addJobs([
				{
					locationId: loc.id,
					address: loc.completeAddress,
					email: loc.email || ''
				}
			]);

			setFlash(
				{
					type: 'success',
					message: 'Location queued for geocoding. Coordinates will be updated shortly.'
				},
				event
			);

			return { success: true, queued: 1 };
		} catch (error) {
			console.error('Error queueing geocoding:', error);
			setFlash(
				{
					type: 'error',
					message: 'Failed to queue geocoding. Please try again.'
				},
				event
			);
			return fail(500, { error: 'Failed to queue geocoding' });
		}
	}
};
