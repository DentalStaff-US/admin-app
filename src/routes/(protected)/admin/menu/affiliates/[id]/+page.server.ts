import { error, fail } from '@sveltejs/kit';
import { z } from 'zod';
import { setFlash } from 'sveltekit-flash-message/server';
import { USER_ROLES, affiliateTypeForRole } from '$lib/config/constants';
import { getAffiliateConfig } from '$lib/server/database/queries/affiliates';
import {
	getAffiliateDetailForAdmin,
	setAffiliateRateOverride,
	setAffiliateStatus,
	resolveFlaggedReferral,
	recordManualAdjustment
} from '$lib/server/database/queries/affiliatesAdmin';
import { resolveCommissionRate } from '$lib/server/affiliate/commission';
import type { AffiliateStatus } from '$lib/server/affiliate/eligibility';

const rateOverrideSchema = z.object({
	ratePercent: z.string().optional(),
	reason: z.string().max(500).optional()
});

const statusSchema = z.object({
	status: z.enum(['PENDING', 'ACTIVE', 'ON_HOLD', 'DENIED']),
	reason: z.string().min(3, 'A reason is required').max(500)
});

const adjustmentSchema = z.object({
	amount: z.string().min(1),
	reason: z.string().min(3, 'A reason is required').max(300)
});

const flaggedSchema = z.object({
	referralId: z.string().min(1),
	approve: z.boolean()
});

function requireSuperadmin(locals: App.Locals) {
	return locals.user?.role === USER_ROLES.SUPERADMIN;
}

export async function load(event) {
	const detail = await getAffiliateDetailForAdmin(event.params.id);
	if (!detail) throw error(404, 'Affiliate not found');

	const config = await getAffiliateConfig();
	const rate = resolveCommissionRate({
		affiliateOverride: detail.profile.commissionRateOverride,
		programDefault: config.commissionRate
	});

	return {
		...detail,
		affiliateType: affiliateTypeForRole(detail.profile.role),
		programRate: config.commissionRate,
		effectiveRate: rate,
		isSuperadmin: requireSuperadmin(event.locals)
	};
}

export const actions = {
	setRateOverride: async (event) => {
		if (!requireSuperadmin(event.locals)) return fail(403, { message: 'Superadmin only' });
		const parsed = rateOverrideSchema.safeParse(Object.fromEntries(await event.request.formData()));
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
			affiliateId: event.params.id,
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
		const parsed = statusSchema.safeParse(Object.fromEntries(await event.request.formData()));
		if (!parsed.success) return fail(400, { message: 'A reason is required' });

		await setAffiliateStatus({
			affiliateId: event.params.id,
			status: parsed.data.status as AffiliateStatus,
			reason: parsed.data.reason,
			setBy: event.locals.user!.id
		});
		setFlash({ type: 'success', message: `Status set to ${parsed.data.status}` }, event);
		return { success: true };
	},

	adjust: async (event) => {
		if (!requireSuperadmin(event.locals)) return fail(403, { message: 'Superadmin only' });
		const parsed = adjustmentSchema.safeParse(Object.fromEntries(await event.request.formData()));
		if (!parsed.success) return fail(400, { message: 'Amount and a reason are required' });

		try {
			const { created } = await recordManualAdjustment({
				affiliateId: event.params.id,
				amountDollars: parsed.data.amount,
				reason: parsed.data.reason,
				setBy: event.locals.user!.id
			});
			setFlash(
				{
					type: created ? 'success' : 'error',
					message: created
						? `Adjustment of $${Number(parsed.data.amount).toFixed(2)} recorded`
						: 'An identical adjustment was already recorded today'
				},
				event
			);
			return { success: created };
		} catch (err) {
			return fail(400, { message: err instanceof Error ? err.message : 'Invalid adjustment' });
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
			reason: 'Reviewed on affiliate detail page'
		});
		setFlash(
			{ type: 'success', message: parsed.data.approve ? 'Referral approved' : 'Referral rejected' },
			event
		);
		return { success: true };
	}
};
