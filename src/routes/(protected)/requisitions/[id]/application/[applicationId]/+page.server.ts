import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, RequestEvent } from './$types';
import {
	approveApplication,
	denyApplication,
	getRequisitionApplicationDetails,
	getRequisitionDetailsById
} from '$lib/server/database/queries/requisitions';
import {
	notifyApplicationApproved,
	notifyApplicationDenied
} from '$lib/server/notifications/transactional';
import { InboxService } from '$lib/server/inbox/service';
import { setFlash } from 'sveltekit-flash-message/server';
import { superValidate } from 'sveltekit-superforms/server';
import { z } from 'zod';
import { USER_ROLES } from '$lib/config/constants';
import { assertCanAccessLocation } from '$lib/server/scoping';
import {
	getClientProfileByStaffUserId,
	getClientProfilebyUserId
} from '$lib/server/database/queries/clients';
import { redirectIfNotValidCustomer } from '$lib/server/database/queries/billing';
import { getPostHogClient } from '$lib/server/posthog';

export const load: PageServerLoad = async (event) => {
	const { id, applicationId } = event.params;
	const user = event.locals.user;

	if (!user) {
		redirect(302, '/auth/sign-in');
	}

	if (user.role === USER_ROLES.SUPERADMIN) {
		redirect(302, '/dashboard');
	}

	const messageForm = await superValidate(event, z.object({ id: z.string() }));
	const approvalForm = await superValidate(event, z.object({ applicationId: z.string() }));
	const applicationDetails = await getRequisitionApplicationDetails(+id, applicationId);

	if (user.role === USER_ROLES.CLIENT) {
		if (!user.completedOnboarding) {
			redirect(302, '/onboarding/client/company');
		}
		const client = await getClientProfilebyUserId(user.id);

		await redirectIfNotValidCustomer(client.id, user.role);

		return {
			user,
			application: applicationDetails || null,
			messageForm,
			approvalForm
		};
	}

	if (user.role === USER_ROLES.CLIENT_STAFF) {
		const client = await getClientProfileByStaffUserId(user.id);

		await redirectIfNotValidCustomer(client?.id, user.role);

		// Access guard: staff must be assigned to this requisition's location.
		const requisition = await getRequisitionDetailsById(+id);
		await assertCanAccessLocation(user, requisition?.requisition?.location?.id);

		return {
			user,
			application: applicationDetails || null,
			messageForm,
			approvalForm
		};
	}
};

export const actions = {
	startConversation: async (event: RequestEvent) => {
		const user = event.locals.user;
		const { id, applicationId } = event.params;

		const applicationDetails = await getRequisitionApplicationDetails(+id, applicationId);

		const form = await superValidate(event, z.object({ id: z.string() }));

		if (!form.valid) {
			fail(400, { form });
		}

		if (!applicationDetails) {
			throw error(404, 'Application not found');
		}
		console.log('Starting conversation for application: ', applicationId);

		const inboxService = new InboxService();

		const existingConversation = await inboxService.findExistingConversation({
			contextId: applicationId,
			contextType: 'APPLICATION',
			participantIds: [user!.id, applicationDetails.user.id]
		});

		if (existingConversation.exists) {
			return redirect(302, `/inbox/${existingConversation.conversationId}`);
		}

		const conversationId = await inboxService.createConversation({
			type: 'APPLICATION',
			participants: [
				{
					userId: applicationDetails.user.id,
					participantType: 'CANDIDATE'
				},
				{
					userId: user!.id,
					participantType: 'CLIENT_STAFF'
				}
			],
			applicationId
		});
		if (conversationId) {
			setFlash({ type: 'success', message: 'Starting new conversation.' }, event);
			const posthog = getPostHogClient();
			posthog.capture({
				distinctId: user!.id,
				event: 'application_conversation_started',
				properties: {
					application_id: applicationId,
					requisition_id: id,
					conversation_id: conversationId
				}
			});
			return redirect(302, `/inbox/${conversationId}`);
		}
	},
	approveApplication: async (event: RequestEvent) => {
		const user = event.locals.user;
		const { id, applicationId } = event.params;

		if (!user || (user && user.role === 'CANDIDATE')) {
			return fail(403);
		}

		try {
			const { autoDeniedAppIds } = await approveApplication(applicationId, user.id);
			setFlash({ type: 'success', message: 'Application approved successfully.' }, event);
			const posthog = getPostHogClient();
			posthog.capture({
				distinctId: user.id,
				event: 'application_approved',
				properties: {
					application_id: applicationId,
					requisition_id: id,
					auto_denied_count: autoDeniedAppIds.length
				}
			});

			// Notifications dispatch outside the DB transaction so a delivery
			// hiccup can't roll back the approval. The notify helpers are
			// perm-only by guard; temp would no-op silently.
			await notifyApplicationApproved(applicationId);
			for (const deniedId of autoDeniedAppIds) {
				await notifyApplicationDenied(deniedId);
			}
		} catch (error) {
			console.error('Error approving application:', error);
			setFlash({ type: 'error', message: 'Error approving application. Please try again.' }, event);
			return fail(500);
		}
		return redirect(302, `/requisitions/${id}/application/${applicationId}`);
	},
	denyApplication: async (event: RequestEvent) => {
		const user = event.locals.user;
		const { id, applicationId } = event.params;

		if (!user || (user && user.role === 'CANDIDATE')) {
			return fail(403);
		}

		try {
			await denyApplication(applicationId, user.id);
			setFlash({ type: 'success', message: 'Application denied.' }, event);
			const posthog = getPostHogClient();
			posthog.capture({
				distinctId: user.id,
				event: 'application_denied',
				properties: { application_id: applicationId, requisition_id: id }
			});
			await notifyApplicationDenied(applicationId);
		} catch (error) {
			console.error('Error denying application:', error);
			setFlash({ type: 'error', message: 'Error denying application. Please try again.' }, event);
			return fail(500);
		}
		return redirect(302, `/requisitions/${id}/application/${applicationId}`);
	}
};
