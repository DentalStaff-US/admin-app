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
	setAffiliateRateOverride,
	setAffiliateStatus,
	resolveFlaggedReferral,
	manuallyAttributeReferral
} from '$lib/server/database/queries/affiliatesAdmin';
import { logger } from '$lib/server/logger';
import type { AffiliateStatus } from '$lib/server/affiliate/eligibility';

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

const rateOverrideSchema = z.object({
	affiliateId: z.string().min(1),
	// Empty string clears the override and falls back to the program default.
	ratePercent: z.string().optional(),
	reason: z.string().max(500).optional()
});

const statusSchema = z.object({
	affiliateId: z.string().min(1),
	status: z.enum(['PENDING', 'ACTIVE', 'ON_HOLD', 'DENIED']),
	reason: z.string().min(1, 'A reason is required').max(500)
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
	const [config, totals, affiliates, payouts, referrals] = await Promise.all([
		getAffiliateConfig(),
		getAffiliateProgramTotals(),
		listAffiliatesForAdmin(),
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

	setRateOverride: async (event) => {
		if (!requireSuperadmin(event.locals)) return fail(403, { message: 'Superadmin only' });

		const data = Object.fromEntries(await event.request.formData());
		const parsed = rateOverrideSchema.safeParse(data);
		if (!parsed.success) return fail(400, { message: 'Invalid override' });

		const raw = (parsed.data.ratePercent ?? '').trim();
		let ratePercent: string | null = null;
		if (raw !== '') {
			const n = Number(raw);
			if (!Number.isFinite(n) || n < 0 || n > 100) {
				return fail(400, { message: 'Override must be between 0 and 100' });
			}
			ratePercent = n.toFixed(2);
		}

		await setAffiliateRateOverride({
			affiliateId: parsed.data.affiliateId,
			ratePercent,
			reason: parsed.data.reason ?? null,
			setBy: event.locals.user!.id
		});

		setFlash(
			{
				type: 'success',
				message: ratePercent
					? `Override set to ${ratePercent}%`
					: 'Override cleared — using the program default'
			},
			event
		);
		return { success: true };
	},

	setStatus: async (event) => {
		if (!requireSuperadmin(event.locals)) return fail(403, { message: 'Superadmin only' });

		const data = Object.fromEntries(await event.request.formData());
		const parsed = statusSchema.safeParse(data);
		if (!parsed.success) return fail(400, { message: 'A reason is required' });

		await setAffiliateStatus({
			affiliateId: parsed.data.affiliateId,
			status: parsed.data.status as AffiliateStatus,
			reason: parsed.data.reason,
			setBy: event.locals.user!.id
		});

		setFlash({ type: 'success', message: `Affiliate set to ${parsed.data.status}` }, event);
		return { success: true };
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
