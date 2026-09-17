import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import { superValidate, message, setError } from 'sveltekit-superforms/server';
import { setFlash } from 'sveltekit-flash-message/server';
import { USER_ROLES } from '$lib/config/constants';
import { getAffiliateConfig } from '$lib/server/database/queries/affiliates';
import {
	listAffiliatesForAdmin,
	getAffiliateProgramTotals,
	listRecentPayouts,
	listReferralsForAdmin,
	updateAffiliateProgramSettings,
	resolveFlaggedReferral,
	manuallyAttributeReferral
} from '$lib/server/database/queries/affiliatesAdmin';
import { logger } from '$lib/server/logger';

// Commission and the payout floor are money settings — validate hard rather than
// coercing, so a typo cannot silently set the rate to 0 or NaN.
const programSettingsSchema = z.object({
	commissionRate: z.coerce
		.number()
		.min(0, 'Rate cannot be negative')
		.max(100, 'Rate cannot exceed 100%'),
	payoutMinimum: z.coerce.number().min(0, 'Minimum cannot be negative'),
	programEnabled: z.boolean().default(false)
});

const flaggedSchema = z.object({
	referralId: z.string().min(1),
	approve: z.boolean(),
	reason: z.string().max(500).optional()
});

const manualAttributionSchema = z.object({
	affiliateId: z.string().min(1),
	referredUserId: z.string().min(1),
	referredRole: z.string().min(1),
	note: z.string().max(500).optional()
});

function requireSuperadmin(locals: App.Locals) {
	return locals.user?.role === USER_ROLES.SUPERADMIN;
}

export async function load(event) {
	const q = event.url.searchParams.get('q') ?? '';
	const status = event.url.searchParams.get('status') ?? '';
	const role = event.url.searchParams.get('role') ?? '';
	const filters = {
		q: q || undefined,
		status: (['PENDING', 'ACTIVE', 'ON_HOLD', 'DENIED'] as const).find((s) => s === status),
		role: role || undefined
	};

	const [config, totals, affiliates, payouts, referrals] = await Promise.all([
		getAffiliateConfig(),
		getAffiliateProgramTotals(),
		listAffiliatesForAdmin(filters),
		listRecentPayouts(),
		listReferralsForAdmin()
	]);

	const settingsForm = await superValidate(event, programSettingsSchema);
	settingsForm.data = {
		commissionRate: Number(config.commissionRate),
		payoutMinimum: Number(config.payoutMinimum),
		programEnabled: config.programEnabled
	};

	return {
		config,
		totals,
		affiliates,
		payouts,
		referrals,
		settingsForm,
		filters: { q, status, role },
		isSuperadmin: event.locals.user?.role === USER_ROLES.SUPERADMIN
	};
}

export const actions = {
	updateSettings: async (event) => {
		if (!requireSuperadmin(event.locals)) return fail(403, { message: 'Superadmin only' });

		const form = await superValidate(event, programSettingsSchema);
		if (!form.valid) return fail(400, { form });

		try {
			await updateAffiliateProgramSettings({
				commissionRate: form.data.commissionRate.toFixed(2),
				payoutMinimum: form.data.payoutMinimum.toFixed(2),
				programEnabled: form.data.programEnabled
			});
			setFlash({ type: 'success', message: 'Affiliate settings updated' }, event);
			return message(form, 'Settings updated');
		} catch (err) {
			logger.error('updateAffiliateProgramSettings failed', { error: err });
			return setError(form, 'Could not update settings');
		}
	},

	resolveFlagged: async (event) => {
		if (!requireSuperadmin(event.locals)) return fail(403, { message: 'Superadmin only' });

		const data = Object.fromEntries(await event.request.formData());
		const parsed = flaggedSchema.safeParse({ ...data, approve: data.approve === 'true' });
		if (!parsed.success) return fail(400, { message: 'Invalid input' });

		await resolveFlaggedReferral({
			referralId: parsed.data.referralId,
			approve: parsed.data.approve,
			reason: parsed.data.reason ?? 'Rejected on review'
		});

		setFlash(
			{ type: 'success', message: parsed.data.approve ? 'Referral approved' : 'Referral rejected' },
			event
		);
		return { success: true };
	},

	manualAttribute: async (event) => {
		if (!requireSuperadmin(event.locals)) return fail(403, { message: 'Superadmin only' });

		const data = Object.fromEntries(await event.request.formData());
		const parsed = manualAttributionSchema.safeParse(data);
		if (!parsed.success) return fail(400, { message: 'Invalid input' });

		const { created } = await manuallyAttributeReferral({
			affiliateId: parsed.data.affiliateId,
			referredUserId: parsed.data.referredUserId,
			referredRole: parsed.data.referredRole,
			note: parsed.data.note ?? ''
		});

		setFlash(
			{
				type: created ? 'success' : 'error',
				message: created
					? 'Referral attributed'
					: 'That user is already attributed — referrals are permanent and cannot be reassigned'
			},
			event
		);
		return { success: created };
	}
};
