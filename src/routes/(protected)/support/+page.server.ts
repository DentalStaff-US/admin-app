import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, RequestEvent } from './$types';
import { USER_ROLES } from '$lib/config/constants';
import {
	createSupportTicket,
	getAllSupportTickets,
	getSupportTicketsForUser
} from '$lib/server/database/queries/support';
import { message, setError, superValidate } from 'sveltekit-superforms/server';
import { newSupportTicketSchema } from '$lib/config/zod-schemas';
import { setFlash } from 'sveltekit-flash-message/server';
import { getPostHogClient } from '$lib/server/posthog';

export const load: PageServerLoad = async (event) => {
	const user = event.locals.user;
	const search = event.url.searchParams.get('search') || '';

	if (!user) {
		redirect(302, '/auth/sign-in');
	}
	const form = await superValidate(event, newSupportTicketSchema);

	if (user.role === USER_ROLES.SUPERADMIN) {
		const supportTickets = await getAllSupportTickets(search);

		return {
			form,
			user,
			tickets: supportTickets || []
		};
	}

	const supportTickets = await getSupportTicketsForUser(user.id);

	return {
		form,
		user,
		tickets: supportTickets || []
	};
};

export const actions = {
	default: async (request: RequestEvent) => {
		const form = await superValidate(request, newSupportTicketSchema);
		let newId;

		if (!form.valid) {
			fail(400, { form });
		}

		try {
			const id = crypto.randomUUID();
			const title = form.data.title;
			const actualResults = form.data.actualResults;
			const expectedResult = form.data.expectedResults;
			const reportedById = request.locals.user!.id;
			const stepsToReproduce = form.data.stepsToReproduce;
			const newTicket = await createSupportTicket({
				id,
				title,
				actualResults,
				expectedResult,
				reportedById,
				stepsToReproduce
			});
			if (newTicket) {
				setFlash({ type: 'success', message: 'New support ticket created.' }, request);
				newId = newTicket.id;
				const posthog = getPostHogClient();
				posthog.capture({
					distinctId: reportedById,
					event: 'support_ticket_created',
					properties: {
						ticket_id: newTicket.id
					}
				});
			}
		} catch (error) {
			console.log({ error });
			setFlash({ type: 'error', message: 'Something went wrong.' }, request);
			return setError(form, 'Error submitting new ticket.');
		}
		return redirect(302, `/support/ticket/${newId}`);
	}
};
