import { fail, redirect } from '@sveltejs/kit';
import { setFlash } from 'sveltekit-flash-message/server';
import { setError, superValidate } from 'sveltekit-superforms/server';

import { clientCompanySchema, clientProfileSchema } from '$lib/config/zod-schemas';
import {
	createClientCompany,
	createClientProfile,
	getClientCompanyByClientId,
	getClientProfilebyUserId
} from '$lib/server/database/queries/clients.js';

const companySchema = clientCompanySchema.pick({
	companyName: true
});
const clientSchema = clientProfileSchema.pick({
	cell_phone: true
});
const mergedSchemas = companySchema.merge(clientSchema);

export const load = async (event) => {
	const user = event.locals.user;
	if (!user) {
		redirect(302, '/auth/sign-in');
	}

	const client = await getClientProfilebyUserId(user.id);
	let existingCompany = null;
	if (client) {
		existingCompany = await getClientCompanyByClientId(client.id);
	}

	// if company exists, then client is in next step of onboarding
	if (existingCompany) {
		redirect(302, '/onboarding/client/location');
	}

	const form = await superValidate(event, mergedSchemas);
	return {
		user,
		form
	};
};

export const actions = {
	default: async (event) => {
		console.log('Submitting company details...');
		const form = await superValidate(event, mergedSchemas);
		console.log(form);

		if (!form.valid) {
			return fail(400, {
				form
			});
		}

		try {
			const clientId = crypto.randomUUID();
			const companyId = crypto.randomUUID();

			await createClientProfile({
				id: clientId,
				userId: event.locals.user!.id,
				cellPhone: form.data.cell_phone,
				createdAt: new Date(),
				updatedAt: new Date()
			});
			const newCompany = await createClientCompany({
				id: companyId,
				clientId,
				companyName: form.data.companyName,
				createdAt: new Date(),
				updatedAt: new Date()
			});

			if (newCompany) {
				// The admin alert deliberately does NOT fire here. This is the first
				// screen of the funnel — the business has no location and no staff
				// yet. It now fires from `completeClientOnboarding` at the staff
				// step, so admins are told about businesses that actually finished.
				setFlash(
					{
						type: 'success',
						message: 'Company details created!'
					},
					event
				);
			}
		} catch (e) {
			console.error(e);
			setFlash({ type: 'error', message: 'Company was not able to be created.' }, event);
			return setError(form, 'Error creating company.');
		}
		redirect(302, '/onboarding/client/staff');
	}
};
