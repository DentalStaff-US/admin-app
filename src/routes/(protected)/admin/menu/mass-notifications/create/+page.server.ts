import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, RequestEvent } from './$types';
import { superValidate } from 'sveltekit-superforms/server';
import { setFlash } from 'sveltekit-flash-message/server';
import { massNotificationSchema } from '$lib/config/zod-schemas';
import { USER_ROLES, CANDIDATE_STATUS, CLIENT_STATUS } from '$lib/config/constants';
import { getAllDisciplines, getAllExperienceLevels } from '$lib/server/database/queries/skills';
import {
	getCampaignAudience,
	createCampaignWithRecipients,
	toCampaignFilters
} from '$lib/server/database/queries/campaigns';
import { getDefaultSearchRadius } from '$lib/server/database/queries/config';

export const load: PageServerLoad = async (event) => {
	const user = event.locals.user;
	if (!user) redirect(302, '/auth/sign-in');
	if (user.role !== USER_ROLES.SUPERADMIN) redirect(302, '/dashboard');

	const [form, disciplines, experienceLevels, radius] = await Promise.all([
		superValidate(event, massNotificationSchema),
		getAllDisciplines(),
		getAllExperienceLevels(),
		getDefaultSearchRadius()
	]);

	return {
		form,
		disciplines,
		experienceLevels,
		candidateStatuses: Object.values(CANDIDATE_STATUS),
		clientStatuses: Object.values(CLIENT_STATUS),
		defaultRadiusMiles: radius.miles,
		testDefaults: { email: user.email }
	};
};

export const actions = {
	queue: async (event: RequestEvent) => {
		const user = event.locals.user;
		if (!user) return fail(401, { message: 'Unauthorized' });
		if (user.role !== USER_ROLES.SUPERADMIN) return fail(403, { message: 'Unauthorized' });

		const form = await superValidate(event, massNotificationSchema);
		if (!form.valid) return fail(400, { form });

		const filters = toCampaignFilters(form.data);
		const recipients = await getCampaignAudience(form.data.audience, form.data.channel, filters);

		if (recipients.length === 0) {
			setFlash(
				{ type: 'error', message: 'No recipients matched these filters — nothing was queued.' },
				event
			);
			return fail(400, { form });
		}

		const { campaignId } = await createCampaignWithRecipients({
			name: form.data.name,
			channel: form.data.channel,
			audience: form.data.audience,
			filters,
			subject: form.data.channel === 'EMAIL' ? (form.data.subject ?? null) : null,
			body: form.data.body,
			createdBy: user.id,
			recipients
		});

		setFlash({ type: 'success', message: `Queued to ${recipients.length} recipient(s).` }, event);
		redirect(303, `/admin/menu/mass-notifications/${campaignId}`);
	}
};
