import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
	clientCanCreateRequisitions,
	USER_ROLES,
	type ClientStatus
} from '$lib/config/constants';
import {
	addStaffToLocation,
	getAllClientStaffProfilesForLocation,
	getClientCompanyByClientId,
	getClientProfileByStaffUserId,
	getClientProfilebyUserId,
	getClientStaffProfilebyClientId,
	getClientStaffProfilebyUserId,
	getLocationByIdForCompany,
	getPendingInvitesForLocation,
	getStaffLocationsWithMeta,
	getStaffProfilesForLocation,
	resendInvite,
	revokeInvite,
	setStaffLocations,
	updateCompanyLocation
} from '$lib/server/database/queries/clients';
import { getRequsitionsForLocation } from '$lib/server/database/queries/requisitions';
import { setError, superValidate } from 'sveltekit-superforms/server';
import { z } from 'zod';
import { setFlash } from 'sveltekit-flash-message/server';
import {
	OperatingHoursSchema,
	ClientLocationDetailsSchema,
	clientRequisitionSchema
} from '$lib/config/zod-schemas';
import { redirectIfNotValidCustomer } from '$lib/server/database/queries/billing';
import db from '$lib/server/database/drizzle';
import { companyOfficeLocationTable } from '$lib/server/database/schemas/client';
import { eq } from 'drizzle-orm';
import { assertCanAccessLocation } from '$lib/server/scoping';

const assignStaffToLocationSchema = z.object({
	staffId: z.string(),
	locationId: z.string(),
	companyId: z.string(),
	isPrimary: z.boolean()
});

export const load: PageServerLoad = async (event) => {
	const user = event.locals.user;
	const { id } = event.params;

	if (!user) {
		redirect(301, '/auth/sign-in');
	}

	if (user.role === USER_ROLES.SUPERADMIN) {
		redirect(301, '/dashboard');
	}

	const form = await superValidate(event, assignStaffToLocationSchema);
	const locationForm = await superValidate(event, ClientLocationDetailsSchema);
	const operatingHoursForm = await superValidate(event, OperatingHoursSchema);
	const clientForm = await superValidate(event, clientRequisitionSchema);

	if (user.role === USER_ROLES.CLIENT) {
		if (!user.completedOnboarding) {
			redirect(302, '/onboarding/client/company');
		}
		const client = await getClientProfilebyUserId(user.id);
		await redirectIfNotValidCustomer(client.id, user.role);

		const company = await getClientCompanyByClientId(client?.id);
		const location = await getLocationByIdForCompany(id, company.id);
		const requisitions = await getRequsitionsForLocation(location.id);
		const locationStaff = await getStaffProfilesForLocation(location.id);
		const staff = await getAllClientStaffProfilesForLocation(company.id, location.id);
		const pendingInvites = await getPendingInvitesForLocation(location.id);

		locationForm.data = {
			name: location.name || '',
			timezone: location.timezone || 'America/New_York',
			streetOne: location.streetOne || '',
			streetTwo: location.streetTwo || '',
			city: location.city || '',
			state: location.state || '',
			zipcode: location.zipcode || '',
			companyPhone: location.companyPhone || '',
			email: location.email || '',
			completeAddress: location.completeAddress || '',
			lat: parseFloat(location.lat as string),
			lon: parseFloat(location.lon as string)
		};
		operatingHoursForm.data = {
			operatingHours: JSON.stringify(location.operatingHours || {})
		};

		const clientStatus = (client?.status ?? 'PENDING') as ClientStatus;
		return {
			user: user,
			client: client || null,
			company: company || null,
			location: location || null,
			requisitions: requisitions || [],
			locationStaff: locationStaff || [],
			allStaff: staff || [],
			pendingInvites,
			assignForm: form,
			locationForm,
			operatingHoursForm,
			clientForm,
			clientStatus,
			canCreateRequisitions: clientCanCreateRequisitions(clientStatus)
		};
	}
	if (user.role === USER_ROLES.CLIENT_STAFF) {
		const client = await getClientProfileByStaffUserId(user.id);
		await redirectIfNotValidCustomer(client?.id, user.role);
		// Access guard: scoped staff can only open their assigned locations.
		await assertCanAccessLocation(user, id);
		const company = await getClientCompanyByClientId(client?.id);
		const location = await getLocationByIdForCompany(id, company.id);
		const requisitions = await getRequsitionsForLocation(location.id);
		const locationStaff = await getClientStaffProfilebyClientId(client?.id);
		const staff = await getAllClientStaffProfilesForLocation(company.id, location.id);
		const pendingInvites = await getPendingInvitesForLocation(location.id);

		locationForm.data = {
			name: location.name || '',
			timezone: location.timezone || 'America/New_York',
			streetOne: location.streetOne || '',
			streetTwo: location.streetTwo || '',
			city: location.city || '',
			state: location.state || '',
			zipcode: location.zipcode || '',
			companyPhone: location.companyPhone || '',
			email: location.email || '',
			completeAddress: location.completeAddress || '',
			lat: parseFloat(location.lat as string),
			lon: parseFloat(location.lon as string)
		};
		operatingHoursForm.data = {
			operatingHours: JSON.stringify(location.operatingHours || {})
		};
		const clientStatus = (client?.status ?? 'PENDING') as ClientStatus;
		return {
			user: user,
			client: client || null,
			company: company || null,
			location: location || null,
			requisitions: requisitions || [],
			locationStaff: locationStaff || [],
			allStaff: staff || [],
			pendingInvites,
			assignForm: form,
			locationForm,
			operatingHoursForm,
			clientForm,
			clientStatus,
			canCreateRequisitions: clientCanCreateRequisitions(clientStatus)
		};
	}
};

export const actions = {
	/**
	 * Per-staff toggle on THIS location. Supports two operations:
	 *   - 'remove'      → drop this location from the staff's set
	 *   - 'makePrimary' → keep current set, flip this location to primary
	 *
	 * Both compute the new full set server-side and route through
	 * setStaffLocations() so we always end up with at most one primary.
	 *
	 * Allowed for SUPERADMIN, CLIENT, and CLIENT_ADMIN client_staff.
	 */
	resendStaffInvite: async (event: RequestEvent) => {
		const user = event.locals.user;
		if (!user) return fail(401, { error: 'Unauthorized' });

		const isClient = user.role === USER_ROLES.CLIENT;
		const staffSelf =
			user.role === USER_ROLES.CLIENT_STAFF
				? await getClientStaffProfilebyUserId(user.id)
				: null;
		const isClientAdmin = staffSelf?.staffRole === 'CLIENT_ADMIN';
		if (!isClient && !isClientAdmin) return fail(403, { error: 'Not allowed' });

		const clientProfile = isClient
			? await getClientProfilebyUserId(user.id)
			: await getClientProfileByStaffUserId(user.id);
		if (!clientProfile) return fail(404, { error: 'Client profile not found' });
		const company = await getClientCompanyByClientId(clientProfile.id);
		if (!company) return fail(404, { error: 'Company not found' });

		const formData = await event.request.formData();
		const inviteId = formData.get('inviteId') as string;
		if (!inviteId) return fail(400, { error: 'Missing inviteId' });

		try {
			const result = await resendInvite(inviteId, company.id);
			if (!result?.success) {
				setFlash({ type: 'error', message: 'Failed to resend invite' }, event);
				return fail(500, { error: 'Resend failed' });
			}
			setFlash({ type: 'success', message: 'Invite email resent' }, event);
			return { success: true };
		} catch (err) {
			if (err && typeof err === 'object' && 'status' in err && 'body' in err) throw err;
			console.error('location resendStaffInvite failed', err);
			setFlash({ type: 'error', message: 'Failed to resend invite' }, event);
			return fail(500, { error: 'Internal error' });
		}
	},

	revokeStaffInvite: async (event: RequestEvent) => {
		const user = event.locals.user;
		if (!user) return fail(401, { error: 'Unauthorized' });

		const isClient = user.role === USER_ROLES.CLIENT;
		const staffSelf =
			user.role === USER_ROLES.CLIENT_STAFF
				? await getClientStaffProfilebyUserId(user.id)
				: null;
		const isClientAdmin = staffSelf?.staffRole === 'CLIENT_ADMIN';
		if (!isClient && !isClientAdmin) return fail(403, { error: 'Not allowed' });

		const clientProfile = isClient
			? await getClientProfilebyUserId(user.id)
			: await getClientProfileByStaffUserId(user.id);
		if (!clientProfile) return fail(404, { error: 'Client profile not found' });
		const company = await getClientCompanyByClientId(clientProfile.id);
		if (!company) return fail(404, { error: 'Company not found' });

		const formData = await event.request.formData();
		const inviteId = formData.get('inviteId') as string;
		if (!inviteId) return fail(400, { error: 'Missing inviteId' });

		try {
			await revokeInvite(inviteId, company.id);
			setFlash({ type: 'success', message: 'Invite revoked' }, event);
			return { success: true };
		} catch (err) {
			if (err && typeof err === 'object' && 'status' in err && 'body' in err) throw err;
			console.error('location revokeStaffInvite failed', err);
			setFlash({ type: 'error', message: 'Failed to revoke invite' }, event);
			return fail(500, { error: 'Internal error' });
		}
	},

	updateStaffOnLocation: async (event: RequestEvent) => {
		const user = event.locals.user;
		const { id: locationId } = event.params;
		if (!user) return fail(401, { error: 'Unauthorized' });

		const isAdmin = user.role === USER_ROLES.SUPERADMIN;
		const isClient = user.role === USER_ROLES.CLIENT;
		const staffSelf =
			user.role === USER_ROLES.CLIENT_STAFF
				? await getClientStaffProfilebyUserId(user.id)
				: null;
		const isClientAdmin = staffSelf?.staffRole === 'CLIENT_ADMIN';
		if (!isAdmin && !isClient && !isClientAdmin) {
			return fail(403, { error: 'Not allowed' });
		}

		const formData = await event.request.formData();
		const staffId = formData.get('staffId') as string;
		const action = formData.get('action') as 'remove' | 'makePrimary';
		if (!staffId || (action !== 'remove' && action !== 'makePrimary')) {
			return fail(400, { error: 'Missing or invalid fields' });
		}

		try {
			// Look up the company that owns this location so we can pass it
			// into setStaffLocations for the ownership check.
			const clientProfile =
				user.role === USER_ROLES.CLIENT
					? await getClientProfilebyUserId(user.id)
					: user.role === USER_ROLES.CLIENT_STAFF
						? await getClientProfileByStaffUserId(user.id)
						: null;
			let companyId: string | undefined;
			if (clientProfile) {
				const company = await getClientCompanyByClientId(clientProfile.id);
				companyId = company?.id;
			} else if (isAdmin) {
				// Admin: derive companyId from the location row itself.
				const locationRow = await db
					.select({ companyId: companyOfficeLocationTable.companyId })
					.from(companyOfficeLocationTable)
					.where(eq(companyOfficeLocationTable.id, locationId))
					.limit(1);
				companyId = locationRow[0]?.companyId;
			}
			if (!companyId) return fail(404, { error: 'Company not found' });

			const existing = await getStaffLocationsWithMeta(staffId);
			let nextIds = existing.map((e) => e.locationId);
			let nextPrimary = existing.find((e) => e.isPrimary)?.locationId ?? null;

			if (action === 'remove') {
				nextIds = nextIds.filter((id) => id !== locationId);
				if (nextPrimary === locationId) {
					nextPrimary = nextIds.length > 0 ? nextIds[0] : null;
				}
			} else if (action === 'makePrimary') {
				if (!nextIds.includes(locationId)) nextIds = [...nextIds, locationId];
				nextPrimary = locationId;
			}

			await setStaffLocations({
				staffId,
				companyId,
				locationIds: nextIds,
				primaryLocationId: nextPrimary
			});

			setFlash(
				{
					type: 'success',
					message: action === 'remove' ? 'Staff removed from location' : 'Primary location updated'
				},
				event
			);
			return { success: true };
		} catch (err) {
			if (err && typeof err === 'object' && 'status' in err && 'body' in err) {
				throw err;
			}
			console.error('updateStaffOnLocation failed', err);
			setFlash({ type: 'error', message: 'Failed to update staff location' }, event);
			return fail(500, { error: 'Internal error' });
		}
	},

	assignStaff: async (event: RequestEvent) => {
		const currentUser = event.locals.user;

		if (!currentUser) {
			fail(401);
		}

		const form = await superValidate(event, assignStaffToLocationSchema);

		if (!form.valid) {
			fail(400, { form });
		}

		try {
			const values = {
				id: crypto.randomUUID(),
				companyId: form.data.companyId,
				staffId: form.data.staffId,
				locationId: form.data.locationId,
				isPrimary: form.data.isPrimary
			};

			await addStaffToLocation(values);
			setFlash(
				{
					type: 'success',
					message: 'Staff added to location successfully.'
				},
				event
			);
			return { form, success: true };
		} catch (e) {
			console.error(e);
			setFlash(
				{
					type: 'error',
					message: 'Error adding staff to location.'
				},
				event
			);
			return { form, success: false };
		}
	},
	updateLocationDetails: async (event) => {
		const user = event.locals.user;
		if (!user) {
			redirect(302, '/auth/sign-in');
		}
		const form = await superValidate(event, ClientLocationDetailsSchema);

		console.log(form);
		if (!form.valid) {
			return fail(400, { form });
		}
		const { id } = event.params;

		const { completeAddress, lat, lon, name, email, companyPhone, timezone } = form.data;

		const details = {
			completeAddress,
			lat: lat?.toString(),
			lon: lon?.toString(),
			timezone,
			companyPhone,
			email,
			name
		};

		try {
			await updateCompanyLocation(id, details);
			setFlash(
				{
					type: 'success',
					message: 'Location details updated successfully'
				},
				event
			);
			return { form };
		} catch (error) {
			console.error('Error updating location details:', error);
			setFlash(
				{
					type: 'error',
					message: 'Failed to update location details. Please try again.'
				},
				event
			);
			return { form };
		}
	},
	updateOperatingHours: async (event) => {
		const user = event.locals.user;
		if (!user) {
			redirect(302, '/auth/sign-in');
		}
		const form = await superValidate(event, OperatingHoursSchema);
		console.log('Operating hours form data:', form, form.data);

		if (!form.valid) {
			return fail(400, { form });
		}

		let jsonHours: Record<
			string,
			{ openTime: string; closeTime: string; isClosed: boolean; timezone: string }
		>;

		try {
			jsonHours = JSON.parse(form.data.operatingHours);
		} catch (error) {
			console.error('Invalid JSON format for operating hours:', error);
			setError(form, 'operatingHours', 'Invalid JSON format for operating hours');
			setFlash(
				{
					type: 'error',
					message: 'Invalid JSON format for operating hours'
				},
				event
			);
			return { form };
		}
		const { id } = event.params;

		try {
			console.log('Updating operating hours:', jsonHours);
			await updateCompanyLocation(id, { operatingHours: jsonHours });
			setFlash(
				{
					type: 'success',
					message: 'Operating hours updated successfully'
				},
				event
			);
			return { form };
		} catch (err) {
			console.error('Error updating operating hours:', err);
			setFlash(
				{
					type: 'error',
					message: 'Failed to update operating hours. Please try again.'
				},
				event
			);
			return { form };
		}
	}
};
