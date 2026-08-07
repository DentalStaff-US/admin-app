import { authenticateUser } from '$lib/server/serverUtils';
import { json, type RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import db from '$lib/server/database/drizzle';
import { newCandidateProfileSchema } from '$lib/config/zod-schemas';
import { candidateProfileTable } from '$lib/server/database/schemas/candidate';
import { eq } from 'drizzle-orm';
import { updateUser } from '$lib/server/database/queries/users';
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

		const parsedProfile = newCandidateProfileSchema.safeParse(body);
		if (!parsedProfile.success) {
			return json(
				{ success: false, message: 'Invalid profile', errors: parsedProfile.error.flatten() },
				{ status: 400, headers: corsHeaders }
			);
		}

		// Check if the user already has a profile
		const [existingProfile] = await db
			.select()
			.from(candidateProfileTable)
			.where(eq(candidateProfileTable.userId, user.id));

		if (existingProfile) {
			console.log('updating profile', existingProfile.id);
			const profile = parsedProfile.data;
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

			await updateUser(user.id, { onboardingStep: 2 });

			return json(
				{
					success: true,
					message: 'Profile updated successfully',
					profile: updatedProfile
				},
				{ status: 200, headers: corsHeaders }
			);
		}

		const profile = parsedProfile.data;
		const newAddressPatch = buildCandidateAddressPatch(profile);
		const profileData = {
			...profile,
			...newAddressPatch.patch,
			userId: user.id, // Explicitly set the user ID
			id: crypto.randomUUID(),
			createdAt: new Date(),
			updatedAt: new Date(),
			birthday: profile.birthday ? new Date(profile.birthday).toISOString() : null
		};

		const [newProfile] = await db.insert(candidateProfileTable).values(profileData).returning();

		if (!newProfile) {
			return json(
				{ success: false, message: 'Failed to create profile' },
				{ status: 500, headers: corsHeaders }
			);
		}

		if (newAddressPatch.needsGeocode && newAddressPatch.completeAddress) {
			geocodingQueue.addJobs([
				{
					candidateId: newProfile.id,
					address: newAddressPatch.completeAddress,
					email: user.email ?? '',
					type: 'candidate'
				}
			]);
		}

		await updateUser(user.id, { onboardingStep: 2 });

		return json(
			{ success: true, message: 'Profile created successfully', profile: newProfile },
			{ status: 200, headers: corsHeaders }
		);
	} catch (error) {
		logger.error('onboarding.setupCandidateProfile failed', { error });
		return json(
			{ success: false, message: 'An unexpected error occurred' },
			{ status: 500, headers: corsHeaders }
		);
	}
};
