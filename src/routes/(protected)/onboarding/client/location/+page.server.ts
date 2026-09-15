import { fail, redirect } from '@sveltejs/kit';
import { setFlash } from 'sveltekit-flash-message/server';
import { setError, superValidate } from 'sveltekit-superforms/server';

import { clientCompanyLocationSchema } from '$lib/config/zod-schemas';
import {
	createCompanyLocation,
	getClientCompanyByClientId,
	getClientProfilebyUserId,
	getPrimaryLocationForCompany
} from '$lib/server/database/queries/clients.js';
import { buildLocationAddressPatch } from '$lib/server/address';
import { geocodingQueue } from '$lib/server/geocode-queue';

const companyLocationSchema = clientCompanyLocationSchema.pick({
	name: true,
	completeAddress: true,
	lat: true,
	lon: true,
	timezone: true,
	phoneNumber: true,
	phoneNumberType: true,
	email: true,
	website: true,
	// Included so the components reach the server if the picker ever posts them;
	// today they're absent and buildLocationAddressPatch parses completeAddress.
	streetOne: true,
	streetTwo: true,
	city: true,
	state: true,
	zipcode: true
});

export const load = async (event) => {
	const form = await superValidate(event, companyLocationSchema);

	const user = event.locals.user;

	if (!user) {
		redirect(302, '/auth/sign-in');
	}

	const client = await getClientProfilebyUserId(user.id);

	const company = await getClientCompanyByClientId(client.id);

	if (!company) redirect(302, '/onboarding/client/company');

	const location = await getPrimaryLocationForCompany(company.id);

	if (location) redirect(302, '/onboarding/client/staff');

	return {
		user,
		form
	};
};

export const actions = {
	default: async (event) => {
		const form = await superValidate(event, companyLocationSchema);

		if (!form.valid) {
			return fail(400, {
				form
			});
		}

		try {
			const locationId = await crypto.randomUUID();
			const client = await getClientProfilebyUserId(event.locals.user!.id);
			const company = await getClientCompanyByClientId(client.id);
			// Onboarding only collects a formatted address string. Derive
			// city/state/zipcode from it so the client is filterable on the
			// clients index from the moment it's created.
			const address = buildLocationAddressPatch(form.data);

			const newLocation = await createCompanyLocation({
				id: locationId,
				createdAt: new Date(),
				updatedAt: new Date(),
				companyId: company.id,
				name: form.data.name,
				...address.patch,
				completeAddress: form.data.completeAddress,
				lat: form.data.lat?.toString(),
				lon: form.data.lon?.toString(),
				timezone: form.data.timezone,
				cellPhone: form.data.phoneNumberType === 'cell' ? form.data.phoneNumber : null,
				companyPhone: form.data.phoneNumberType === 'office' ? form.data.phoneNumber : null,
				email: form.data.email || null,
				website: form.data.website || null
			});

			// Mapbox is the backstop when the string alone can't be resolved.
			if (address.needsGeocode && address.completeAddress) {
				geocodingQueue.addJobs([
					{
						locationId,
						address: address.completeAddress,
						email: form.data.email || '',
						type: 'location'
					}
				]);
			}

			if (newLocation) {
				setFlash(
					{
						type: 'success',
						message: 'New location created!'
					},
					event
				);
			}
		} catch (e) {
			console.error(e);
			setFlash({ type: 'error', message: 'Location was not able to be created.' }, event);
			return setError(form, 'Error creating location.');
		}
		redirect(302, '/onboarding/client/location');
	}
};
