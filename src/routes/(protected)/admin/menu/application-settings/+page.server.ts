import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { USER_ROLES } from '$lib/config/constants';
import db from '$lib/server/database/drizzle';
import { adminConfigTable } from '$lib/server/database/schemas/config';
import { superValidate, message } from 'sveltekit-superforms/server';
import { z } from 'zod';
import { setFlash } from 'sveltekit-flash-message/server';
import { eq } from 'drizzle-orm';

const SettingsSchema = z.object({
	paymentFee: z.coerce
		.number()
		.min(0, 'Payment fee must be a positive number')
		.refine((val) => Number.isInteger(val), 'Payment fee must be a whole number'),
	paymentFeeType: z.enum(['PERCENTAGE', 'FIXED']),
	defaultSearchRadiusMiles: z.coerce
		.number()
		.int('Radius must be a whole number')
		.min(1, 'Radius must be at least 1 mile')
		.max(500, 'Radius must be 500 miles or less')
});

export const load: PageServerLoad = async (event) => {
	const { locals } = event;
	const { user } = locals;
	if (!user) {
		redirect(303, '/auth/sign-in');
	}

	if (user.role !== USER_ROLES.SUPERADMIN) {
		redirect(303, '/dashboard');
	}

	const [adminSettings] = await db.select().from(adminConfigTable).limit(1);

	if (!adminSettings) {
		// Handle the case where no admin settings are found
		// Create admin settings
	}

	const settingsForm = await superValidate(event, SettingsSchema);

	settingsForm.data = {
		paymentFee: adminSettings?.adminPaymentFee || 0,
		paymentFeeType: adminSettings?.adminPaymentFeeType || 'PERCENTAGE',
		defaultSearchRadiusMiles: adminSettings?.defaultSearchRadiusMiles ?? 60
	};

	return {
		user,
		adminSettings: adminSettings || {},
		settingsForm
	};
};

export const actions = {
	updateSettings: async (event) => {
		const { locals } = event;
		const { user } = locals;

		if (!user) {
			throw redirect(303, '/auth/sign-in');
		}
		if (user.role !== USER_ROLES.SUPERADMIN) {
			throw error(401, 'Unauthorized');
		}

		const form = await superValidate(event, SettingsSchema);
		if (!form.valid) {
			return message(form, 'Invalid form data', { status: 400 });
		}

		const [adminSettings] = await db.select().from(adminConfigTable).limit(1);
		const { paymentFee, paymentFeeType, defaultSearchRadiusMiles } = form.data;

		await db
			.update(adminConfigTable)
			.set({
				adminPaymentFee: paymentFee,
				adminPaymentFeeType: paymentFeeType,
				defaultSearchRadiusMiles
			})
			.where(eq(adminConfigTable.id, adminSettings.id));

		setFlash({ type: 'success', message: 'Application settings updated' }, event);
		return { form };
	}
};
