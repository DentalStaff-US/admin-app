import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { USER_ROLES } from '$lib/config/constants.js';

import type { Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { userTable, type User } from '$lib/server/database/schemas/auth';
import db from '$lib/server/database/drizzle';
import { companyOfficeLocationTable } from '$lib/server/database/schemas/client';
import { inArray, isNotNull, isNull, and, or } from 'drizzle-orm';
import {
	bulkCreateSuperadmins,
	bulkCreateClients,
	bulkCreateCandidates,
	type BulkCreateResult
} from '$lib/server/database/queries/admin';
import { geocodingQueue } from '$lib/server/geocode-queue';
import { setFlash } from 'sveltekit-flash-message/server';
import { candidateProfileTable } from '$lib/server/database/schemas/candidate';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		redirect(301, '/login');
	}

	if (locals.user.role !== USER_ROLES.SUPERADMIN) {
		redirect(301, '/dashboard');
	}
};

type UserRole = 'SUPERADMIN' | 'CLIENT' | 'CANDIDATE';

interface ImportUser {
	firstName: string;
	lastName: string;
	email: string;
	companyName?: string;
	companyLogo?: string;
	baseLocation?: string;
	address?: string;
	discipline?: string;
}

export const actions: Actions = {
	importUsers: async (event) => {
		const { request } = event;
		const formData = await request.formData();
		const role = formData.get('role') as UserRole;
		const usersJson = formData.get('users') as string;

		if (!role || !usersJson) {
			return fail(400, { error: 'Missing required data' });
		}

		let users: ImportUser[];
		try {
			users = JSON.parse(usersJson);
		} catch (e) {
			return fail(400, { error: 'Invalid user data' });
		}

		const results = {
			success: 0,
			skipped: 0,
			errors: [] as string[],
			geocodingQueued: 0
		};

		// Pre-check existing users in bulk
		const emails = users.map((u) => u.email);
		const existingUsers = await db
			.select({ email: userTable.email })
			.from(userTable)
			.where(inArray(userTable.email, emails));

		const existingEmailSet = new Set(existingUsers.map((u) => u.email));

		// Filter out existing users
		const newUsers = users.filter((u) => {
			if (existingEmailSet.has(u.email)) {
				results.skipped++;
				results.errors.push(`${u.email} - already exists`);
				return false;
			}
			return true;
		});

		if (newUsers.length === 0) {
			return { ...results, success: true };
		}

		try {
			let bulkResult: BulkCreateResult | undefined;

			// Use transaction for atomicity
			await db.transaction(async (tx) => {
				if (role === 'SUPERADMIN') {
					await bulkCreateSuperadmins(tx, newUsers);
				} else if (role === 'CLIENT') {
					bulkResult = await bulkCreateClients(tx, newUsers);
				} else if (role === 'CANDIDATE') {
					bulkResult = await bulkCreateCandidates(tx, newUsers);
				}
			});

			results.success = newUsers.length;

			if (bulkResult?.locationJobData && bulkResult.locationJobData.length > 0) {
				geocodingQueue.addJobs(bulkResult.locationJobData); // type: 'location' already in each job
				results.geocodingQueued = bulkResult.locationJobData.length;
			}

			if (bulkResult?.candidateJobData && bulkResult.candidateJobData.length > 0) {
				geocodingQueue.addJobs(bulkResult.candidateJobData); // type: 'candidate' already in each job
				results.geocodingQueued =
					(results.geocodingQueued || 0) + bulkResult.candidateJobData.length;
			}

			setFlash(
				{
					type: 'success',
					message: `Successfully imported ${results.success} users${results.geocodingQueued > 0 ? `. Geocoding ${results.geocodingQueued} locations in background.` : ''}`
				},
				event
			);
		} catch (error) {
			console.error('Bulk insert error:', error);
			setFlash(
				{
					type: 'error',
					message: 'Failed to import users'
				},
				event
			);
			return fail(500, {
				error: 'Failed to import users',
				details: error instanceof Error ? error.message : 'Unknown error'
			});
		}

		return results;
	},

	geocodePendingLocations: async () => {
		try {
			const pendingLocations = await db
				.select({
					id: companyOfficeLocationTable.id,
					completeAddress: companyOfficeLocationTable.completeAddress,
					email: companyOfficeLocationTable.email
				})
				.from(companyOfficeLocationTable)
				.where(
					and(
						isNull(companyOfficeLocationTable.lat),
						isNotNull(companyOfficeLocationTable.completeAddress)
					)
				);

			console.log(`Found ${pendingLocations.length} locations without coordinates`);

			const jobs = pendingLocations
				.filter((loc) => loc.completeAddress && loc.completeAddress.trim())
				.map((loc) => ({
					locationId: loc.id,
					address: loc.completeAddress!,
					email: loc.email || '',
					type: 'location' as const // ← ADD THIS
				}));

			geocodingQueue.addJobs(jobs);

			return {
				success: true,
				queued: jobs.length,
				message: `Queued ${jobs.length} locations for geocoding`
			};
		} catch (error) {
			console.error('Error in geocodePendingLocations:', error);
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	},
	geocodePendingCandidates: async () => {
		try {
			const pendingCandidates = await db
				.select({
					id: candidateProfileTable.id,
					completeAddress: candidateProfileTable.completeAddress,
					address: candidateProfileTable.address
				})
				.from(candidateProfileTable)
				.where(
					and(
						or(isNull(candidateProfileTable.lat), isNull(candidateProfileTable.lon)),
						or(
							isNotNull(candidateProfileTable.completeAddress),
							isNotNull(candidateProfileTable.address)
						)
					)
				);

			const jobs = pendingCandidates
				.filter((c) => c.completeAddress || c.address)
				.map((c) => ({
					candidateId: c.id,
					address: c.completeAddress || c.address!,
					email: '',
					type: 'candidate' as const
				}));

			if (jobs.length === 0) {
				return {
					success: true,
					queued: 0,
					message: 'No candidates need geocoding'
				};
			}

			geocodingQueue.addJobs(jobs);

			return {
				success: true,
				queued: jobs.length,
				message: `Queued ${jobs.length} candidates for geocoding`
			};
		} catch (error) {
			console.error('Error queueing candidates:', error);
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	},

	getGeocodingStatus: async () => {
		try {
			const status = geocodingQueue.getQueueStatus();
			console.log('Geocoding status:', status);
			return { success: true, ...status };
		} catch (error) {
			console.error('Error getting status:', error);
			return { success: false, queueSize: 0, processing: false };
		}
	},
	deleteAllUsers: async (event) => {
		const { request } = event;
		const formData = await request.formData();
		const emailsJson = formData.get('emails') as string;

		if (!emailsJson) {
			return fail(400, { error: 'Missing emails data' });
		}

		let emails: string[];
		try {
			emails = JSON.parse(emailsJson);
		} catch (e) {
			return fail(400, { error: 'Invalid emails data' });
		}

		try {
			await db.transaction(async (tx) => {
				// Delete related records first to avoid foreign key constraints
				// Then delete users
				await tx.delete(userTable).where(inArray(userTable.email, emails));
			});

			setFlash(
				{
					type: 'success',
					message: `Successfully deleted ${emails.length} users`
				},
				event
			);

			return { success: true, message: 'All users deleted' };
		} catch (error) {
			console.error('Error deleting users:', error);
			setFlash(
				{
					type: 'error',
					message: 'Failed to delete users'
				},
				event
			);
			return fail(500, {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			});
		}
	},
	geocodeAllPending: async () => {
		try {
			// Get pending locations
			const pendingLocations = await db
				.select({
					id: companyOfficeLocationTable.id,
					completeAddress: companyOfficeLocationTable.completeAddress,
					email: companyOfficeLocationTable.email
				})
				.from(companyOfficeLocationTable)
				.where(
					and(
						or(isNull(companyOfficeLocationTable.lat), isNull(companyOfficeLocationTable.lon)),
						isNotNull(companyOfficeLocationTable.completeAddress)
					)
				);

			// Get pending candidates
			const pendingCandidates = await db
				.select({
					id: candidateProfileTable.id,
					completeAddress: candidateProfileTable.completeAddress,
					address: candidateProfileTable.address
				})
				.from(candidateProfileTable)
				.where(
					and(
						or(isNull(candidateProfileTable.lat), isNull(candidateProfileTable.lon)),
						or(
							isNotNull(candidateProfileTable.completeAddress),
							isNotNull(candidateProfileTable.address)
						)
					)
				);

			const locationJobs = pendingLocations
				.filter((loc) => loc.completeAddress && loc.completeAddress.trim())
				.map((loc) => ({
					locationId: loc.id,
					address: loc.completeAddress!,
					email: loc.email || '',
					type: 'location' as const
				}));

			const candidateJobs = pendingCandidates
				.filter((c) => c.completeAddress || c.address)
				.map((c) => ({
					candidateId: c.id,
					address: c.completeAddress || c.address!,
					email: '',
					type: 'candidate' as const
				}));

			const allJobs = [...locationJobs, ...candidateJobs];

			if (allJobs.length === 0) {
				return {
					success: true,
					queued: 0,
					locationCount: 0,
					candidateCount: 0,
					message: 'No addresses need geocoding'
				};
			}

			geocodingQueue.addJobs(allJobs);

			return {
				success: true,
				queued: allJobs.length,
				locationCount: locationJobs.length,
				candidateCount: candidateJobs.length,
				message: `Queued ${locationJobs.length} locations and ${candidateJobs.length} candidates for geocoding`
			};
		} catch (error) {
			console.error('Error queueing all pending:', error);
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}
};
