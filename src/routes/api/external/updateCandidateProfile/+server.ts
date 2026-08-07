import { authenticateUser } from '$lib/server/serverUtils';
import { json, type RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import db from '$lib/server/database/drizzle';
import { newCandidateProfileSchema } from '$lib/config/zod-schemas';
import { candidateProfileTable } from '$lib/server/database/schemas/candidate';
import { eq } from 'drizzle-orm';
import { logger } from '$lib/server/logger';
import { buildCandidateAddressPatch } from '$lib/server/address';
import { geocodingQueue } from '$lib/server/geocode-queue';

const corsHeaders = {
	'Access-Control-Allow-Origin': env.CANDIDATE_APP_DOMAIN,
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization',
	'Access-Control-Allow-Credentials': 'true'
};

export const OPTIONS: RequestHandler = async () => {
	return new Response(null, {
		headers: corsHeaders
	});
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const user = await authenticateUser(request);
		if (!user) {
			return json(
				{ success: false, message: 'Unauthorized' },
				{ status: 401, headers: corsHeaders }
			);
		}

		const body = await request.json().catch(() => null);
		if (!body || typeof body !== 'object') {
			return json(
				{ success: false, message: 'Invalid request body' },
				{ status: 400, headers: corsHeaders }
			);
		}
		console.log(body);
		const parsedProfile = newCandidateProfileSchema.safeParse(body);
		console.log(parsedProfile?.error);
		if (!parsedProfile.success) {
			return json(
				{ success: false, message: 'Invalid profile', errors: parsedProfile.error.flatten() },
				{ status: 400, headers: corsHeaders }
			);
		}

		const [existingProfile] = await db
			.select()
			.from(candidateProfileTable)
			.where(eq(candidateProfileTable.userId, user.id));

		if (!existingProfile) {
			return json(
				{ success: false, message: 'Profile not found' },
				{ status: 404, headers: corsHeaders }
			);
		}

		// Strip fields whose values arrived as the literal string "undefined" —
		// caused by Svelte rendering `value={x}` where `x` is `undefined`; the
		// browser submits the attribute as the string "undefined", which Zod's
		// `z.string().optional()` accepts but the DB rejects on numeric columns
		// (lat, lon). Empty strings are left alone — they may be a legitimate
		// "clear this field" signal from the form.
		const profile = Object.fromEntries(
			Object.entries(parsedProfile.data).filter(([, v]) => v !== 'undefined')
		) as typeof parsedProfile.data;

		// Normalize the granular address fields (2-letter state, 5-digit zip) and
		// backfill any the client didn't send from completeAddress.
		const addressPatch = buildCandidateAddressPatch(profile);

		const updatedData = {
			...profile,
			...addressPatch.patch,
			updatedAt: new Date(),
			birthday: profile.birthday ? new Date(profile.birthday).toISOString() : null
		};

		const [updatedProfile] = await db
			.update(candidateProfileTable)
			.set(updatedData)
			.where(eq(candidateProfileTable.id, existingProfile.id))
			.returning();

		if (addressPatch.needsGeocode && addressPatch.completeAddress) {
			geocodingQueue.addJobs([
				{
					candidateId: existingProfile.id,
					address: addressPatch.completeAddress,
					email: user.email ?? '',
					type: 'candidate'
				}
			]);
		}

		console.log('profile updated!');

		return json(
			{
				success: true,
				message: 'Profile updated successfully',
				profile: updatedProfile
			},
			{ status: 200, headers: corsHeaders }
		);
	} catch (error) {
		logger.error('updateCandidateProfile failed', { error });
		return json(
			{ success: false, message: 'An unexpected error occurred' },
			{ status: 500, headers: corsHeaders }
		);
	}
};
