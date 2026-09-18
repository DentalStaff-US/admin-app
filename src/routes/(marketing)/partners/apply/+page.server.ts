import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { auth } from '$lib/server/auth';
import db from '$lib/server/database/drizzle';
import { userTable } from '$lib/server/database/schemas/auth';
import { affiliateProfileTable } from '$lib/server/database/schemas/affiliate';
import { ensureAffiliateProfile } from '$lib/server/affiliate/enroll';
import { getAffiliateConfig } from '$lib/server/database/queries/affiliates';
import { USER_ROLES } from '$lib/config/constants';
import { PARTNER_PORTAL_URL } from '$lib/config/portal';
import { logger } from '$lib/server/logger';

/**
 * Public application for EXTERNAL partners — dental schools, supply companies,
 * consultants, influencers. Anyone who is neither a practice nor a professional.
 *
 * Practices and professionals do NOT come through here: they already have an
 * account and enrol from their settings page.
 *
 * Applications land as PENDING with no working referral link. A superadmin
 * approves them at /admin/menu/affiliates.
 */
const applicationSchema = z.object({
	firstName: z.string().min(1, 'First name is required').max(100),
	lastName: z.string().min(1, 'Last name is required').max(100),
	email: z.string().email('Enter a valid email address'),
	password: z.string().min(8, 'Password must be at least 8 characters'),
	organizationName: z.string().min(1, 'Organization is required').max(200),
	website: z.string().max(300).optional(),
	audience: z.string().max(1000).optional()
});

export async function load() {
	const config = await getAffiliateConfig();
	return { programEnabled: config.programEnabled, portalUrl: PARTNER_PORTAL_URL };
}

export const actions = {
	default: async (event) => {
		const raw = Object.fromEntries(await event.request.formData());
		// Echoed back so a rejected submission does not clear the form. Password is
		// never echoed.
		const values = { ...raw, password: '' };

		const config = await getAffiliateConfig();
		if (!config.programEnabled) {
			return fail(503, {
				message: 'The partner program is not accepting applications right now.',
				values
			});
		}
		const parsed = applicationSchema.safeParse(raw);
		if (!parsed.success) {
			return fail(400, {
				message: parsed.error.issues[0]?.message ?? 'Please check the form and try again.',
				values
			});
		}

		const email = parsed.data.email.toLowerCase().trim();

		const [existing] = await db
			.select({ id: userTable.id })
			.from(userTable)
			.where(eq(userTable.email, email))
			.limit(1);

		if (existing) {
			// Do not reveal whether the address already has an account, and do not
			// silently convert an existing practice/professional into a partner.
			return fail(400, {
				message:
					'We could not create an account with that email. If you already have a DTSS account, sign in and join from your settings page.',
				values
			});
		}

		let newUserId: string;
		try {
			const result = await auth.api.signUpEmail({
				headers: event.request.headers,
				body: {
					email,
					password: parsed.data.password,
					name: `${parsed.data.firstName} ${parsed.data.lastName}`.trim(),
					firstName: parsed.data.firstName,
					lastName: parsed.data.lastName
				}
			});
			newUserId = result.user.id;
		} catch (err) {
			logger.error('partner application signup failed', { error: err });
			return fail(500, {
				message: 'Something went wrong creating your account. Please try again.',
				values
			});
		}

		try {
			// `role` is input:false in the Better Auth config, so it is patched here.
			await db
				.update(userTable)
				.set({ role: USER_ROLES.EXTERNAL_PARTNER, updatedAt: new Date() })
				.where(eq(userTable.id, newUserId));

			// External partners have no internal profile status to derive from, so
			// ensureAffiliateProfile enrols them straight to PENDING.
			const { profile } = await ensureAffiliateProfile(newUserId, {
				displayName: `${parsed.data.firstName} ${parsed.data.lastName}`.trim(),
				contactEmail: email
			});

			await db
				.update(affiliateProfileTable)
				.set({
					organizationName: parsed.data.organizationName,
					website: parsed.data.website || null,
					notes: parsed.data.audience || null,
					agreedToTermsAt: new Date(),
					updatedAt: new Date()
				})
				.where(eq(affiliateProfileTable.id, profile.id));

			logger.event('partner_application_submitted', {
				distinctId: newUserId,
				organization: parsed.data.organizationName
			});
		} catch (err) {
			logger.error('partner application profile setup failed', { error: err, userId: newUserId });
			return fail(500, {
				message:
					'Your account was created but we could not finish your application. Please contact support.',
				values
			});
		}

		return { success: true, values };
	}
};
