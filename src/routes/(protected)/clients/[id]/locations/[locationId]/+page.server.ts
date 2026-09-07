import {
	createLocationContactDestination,
	deleteLocationContactDestination,
	getClientProfileById,
	getLocationAddressSnapshot,
	getLocationByIdForCompany,
	getLocationContactDestinations,
	getLocationTimezone,
	updateCompanyLocation
} from '$lib/server/database/queries/clients';
import { buildLocationAddressPatch } from '$lib/server/address';
import { fail, redirect } from '@sveltejs/kit';
import { setError, superValidate } from 'sveltekit-superforms/server';
import type { PageServerLoad } from './$types';
import { setFlash } from 'sveltekit-flash-message/server';
import {
	ContactSchema,
	LocationContactDestinationSchema,
	LocationSchema,
	NewAddressSchema,
	OperatingHoursSchema,
	RemoveLocationContactDestinationSchema
} from '$lib/config/zod-schemas';
import { geocodingQueue } from '$lib/server/geocode-queue';
import { companyOfficeLocationTable } from '$lib/server/database/schemas/client';
import db from '$lib/server/database/drizzle';
import { eq } from 'drizzle-orm';
import { normalizeUSPhone } from '$lib/_helpers/phone';
import {
	getLocationTimezoneDrift,
	syncRequisitionTimezonesForLocation
} from '$lib/server/requisitions/referenceTimezone';
import { logger } from '$lib/server/logger';

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
	const contactDestinations = location ? await getLocationContactDestinations(location.id) : [];
	const addressForm = await superValidate(event, NewAddressSchema);
	const contactForm = await superValidate(event, ContactSchema);
	const operatingHoursForm = await superValidate(event, OperatingHoursSchema);
	const locationForm = await superValidate(event, LocationSchema);
	const destinationForm = await superValidate(event, LocationContactDestinationSchema);

	addressForm.data = {
		completeAddress: location.completeAddress || '',
		lat: parseFloat(location.lat || '0'),
		lon: parseFloat(location.lon || '0')
	};

	contactForm.data = {
		companyPhone: location.companyPhone || '',
		email: location.email || '',
		website: location.website || ''
	};

	operatingHoursForm.data = {
		operatingHours: JSON.stringify(location.operatingHours)
	};

	locationForm.data = {
		timezone: location.timezone || 'America/New_York'
	};

	// Requisitions created before the location↔requisition timezone sync existed
	// can still be pinned to a stale zone. Surface them so they can be corrected
	// from here without editing each requisition.
	const timezoneDrift = location ? await getLocationTimezoneDrift(location.id) : null;

	return {
		user,
		client,
		location,
		contactDestinations,
		addressForm,
		contactForm,
		operatingHoursForm,
		locationForm,
		destinationForm,
		timezoneDrift
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

		// Keep city/state/zipcode in step with the address. Without this an
		// address change left the old city behind, and the clients index filters
		// on those columns.
		const previous = await getLocationAddressSnapshot(locationId);
		const address = buildLocationAddressPatch(form.data, {
			previousCompleteAddress: previous?.completeAddress ?? null
		});

		const addressData = {
			...address.patch,
			completeAddress,
			lat: lat.toString() || null,
			lon: lon.toString() || null
		};

		try {
			await updateCompanyLocation(locationId, addressData);

			// Mapbox is the backstop when the string alone can't be resolved.
			if (address.needsGeocode && address.completeAddress) {
				geocodingQueue.addJobs([
					{
						locationId,
						address: address.completeAddress,
						email: '',
						type: 'location'
					}
				]);
			}

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
		const { companyPhone, email, website } = form.data;
		const contactData = {
			companyPhone: companyPhone || '',
			email: email || '',
			website: website || ''
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

		// Stamp every day's timezone from the location's authoritative `timezone`
		// column so saved hours never drift back to a stale/hardcoded zone.
		const locationTimezone = await getLocationTimezone(locationId);
		for (const day of Object.values(jsonHours)) {
			day.timezone = locationTimezone;
		}

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
			const previousTimezone = await getLocationTimezone(locationId);
			await updateCompanyLocation(locationId, {
				timezone
			});

			// The location's zone is the source of truth — carry it onto every
			// requisition here so shift times don't stay stuck in the old zone.
			let syncNote = '';
			if (timezone && timezone !== previousTimezone) {
				const sync = await syncRequisitionTimezonesForLocation({
					locationId,
					timezone,
					actorUserId: user.id
				});
				if (sync.requisitionsUpdated > 0) {
					syncNote = ` Updated ${sync.requisitionsUpdated} requisition${
						sync.requisitionsUpdated === 1 ? '' : 's'
					} and re-based ${sync.daysRewritten} upcoming shift${
						sync.daysRewritten === 1 ? '' : 's'
					} (local start/end times unchanged).`;
				}
			}

			setFlash(
				{
					type: 'success',
					message: `Location updated successfully.${syncNote}`
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
	// Manual rectification for requisitions that drifted before the sync above
	// existed — re-saving the location is a no-op once its own zone is correct.
	resyncRequisitionTimezones: async (event) => {
		const user = event.locals.user;
		if (!user) {
			redirect(302, '/auth/sign-in');
		}
		if (user.role !== 'SUPERADMIN') {
			return fail(403, { error: 'Not authorized' });
		}
		const { locationId } = event.params;

		try {
			const timezone = await getLocationTimezone(locationId);
			const sync = await syncRequisitionTimezonesForLocation({
				locationId,
				timezone,
				actorUserId: user.id
			});

			setFlash(
				{
					type: 'success',
					message: sync.requisitionsUpdated
						? `Re-synced ${sync.requisitionsUpdated} requisition${
								sync.requisitionsUpdated === 1 ? '' : 's'
							} to ${timezone} and re-based ${sync.daysRewritten} upcoming shift${
								sync.daysRewritten === 1 ? '' : 's'
							}.`
						: `All requisitions already use ${timezone}.`
				},
				event
			);
			return { success: true, ...sync };
		} catch (err) {
			logger.error('failed to resync requisition timezones for location', {
				error: err,
				locationId,
				distinctId: user.id
			});
			setFlash({ type: 'error', message: 'Failed to re-sync requisition timezones.' }, event);
			return fail(500, { error: 'Failed to re-sync requisition timezones' });
		}
	},
	addContactDestination: async (event) => {
		const user = event.locals.user;
		if (!user) {
			redirect(302, '/auth/sign-in');
		}
		const form = await superValidate(event, LocationContactDestinationSchema);
		if (!form.valid) {
			return fail(400, { destinationForm: form });
		}
		const { id, locationId } = event.params;
		const client = await getClientProfileById(id);
		const location = await getLocationByIdForCompany(locationId, client?.company?.id);
		if (!location) {
			setFlash({ type: 'error', message: 'Location not found' }, event);
			return fail(404, { destinationForm: form });
		}

		const value =
			form.data.type === 'SMS'
				? (normalizeUSPhone(form.data.value) ?? form.data.value)
				: form.data.value.trim().toLowerCase();

		try {
			await createLocationContactDestination({
				locationId: location.id,
				type: form.data.type,
				value
			});
			setFlash({ type: 'success', message: 'Notification destination added' }, event);
			form.data = { type: 'EMAIL', value: '' };
			return { destinationForm: form };
		} catch (err) {
			console.error('Error adding contact destination:', err);
			setFlash({ type: 'error', message: 'Failed to add destination. Please try again.' }, event);
			return fail(500, { destinationForm: form });
		}
	},
	removeContactDestination: async (event) => {
		const user = event.locals.user;
		if (!user) {
			redirect(302, '/auth/sign-in');
		}
		const form = await superValidate(event, RemoveLocationContactDestinationSchema);
		if (!form.valid) {
			return fail(400, { form });
		}
		const { id, locationId } = event.params;
		const client = await getClientProfileById(id);
		const location = await getLocationByIdForCompany(locationId, client?.company?.id);
		if (!location) {
			setFlash({ type: 'error', message: 'Location not found' }, event);
			return fail(404, { form });
		}

		try {
			const removed = await deleteLocationContactDestination(form.data.id, location.id);
			if (!removed) {
				setFlash({ type: 'error', message: 'Destination not found' }, event);
				return fail(404, { form });
			}
			setFlash({ type: 'success', message: 'Notification destination removed' }, event);
			return { form };
		} catch (err) {
			console.error('Error removing contact destination:', err);
			setFlash(
				{ type: 'error', message: 'Failed to remove destination. Please try again.' },
				event
			);
			return fail(500, { form });
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
			// `type` is required: processQueue branches on it, and a job without
			// one matched neither branch — the button reported success and wrote
			// nothing.
			geocodingQueue.addJobs([
				{
					locationId: loc.id,
					address: loc.completeAddress,
					email: loc.email || '',
					type: 'location'
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
