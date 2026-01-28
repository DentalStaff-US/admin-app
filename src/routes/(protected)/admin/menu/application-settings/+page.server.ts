import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { USER_ROLES } from '$lib/config/constants';
import db from '$lib/server/database/drizzle';
import { adminConfigTable } from '$lib/server/database/schemas/config';
import { superValidate, message } from 'sveltekit-superforms/server';
import { z } from 'zod';
import { setFlash } from 'sveltekit-flash-message/server';
import { eq } from 'drizzle-orm';

const PaymentFeeSchema = z.object({
	paymentFee: z.coerce
		.number()
		.min(0, 'Payment fee must be a positive number')
		.refine((val) => Number.isInteger(val), 'Payment fee must be a whole number'),
	paymentFeeType: z.enum(['PERCENTAGE', 'FIXED'])
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

	const paymentFeeForm = await superValidate(event, PaymentFeeSchema);

	// Set the data exactly like your working example
	paymentFeeForm.data = {
		paymentFee: adminSettings?.adminPaymentFee || 0,
		paymentFeeType: adminSettings?.adminPaymentFeeType || 'PERCENTAGE'
	};

	return {
		user,
		adminSettings: adminSettings || {},
		paymentFeeForm
	};
};

export const actions = {
	updatePaymentFee: async (event) => {
		const { locals } = event;
		const { user } = locals;

		if (!user) {
			throw redirect(303, '/auth/sign-in');
		}

		if (user.role !== USER_ROLES.SUPERADMIN) {
			throw error(401, 'Unauthorized');
		}

		const form = await superValidate(event, PaymentFeeSchema);

		if (!form.valid) {
			return message(form, 'Invalid form data', { status: 400 });
		}

		const [adminSettings] = await db.select().from(adminConfigTable).limit(1);

		const { paymentFee, paymentFeeType } = form.data;

		await db
			.update(adminConfigTable)
			.set({
				adminPaymentFee: paymentFee,
				adminPaymentFeeType: paymentFeeType
			})
			.where(eq(adminConfigTable.id, adminSettings.id));

		try {
			setFlash(
				{
					type: 'success',
					message: 'Payment fee updated successfully'
				},
				event
			);
			return { form };
		} catch (err) {
			throw error(500, 'Failed to update payment fee');
		}
	}
};
