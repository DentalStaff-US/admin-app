/**
 * The practice's team page (/team): staff, their locations and pending invites.
 * Only the owner (CLIENT) and CLIENT_ADMIN staff manage the team; the actions
 * that change it live on the settings route and are re-exported by /team.
 */
import { z } from 'zod';
import { superValidate } from 'sveltekit-superforms/server';
import { USER_ROLES } from '$lib/config/constants';
import type { AppUser } from '$lib/server/auth';
import {
	getAllClientLocationsByCompanyId,
	getAllClientStaffProfiles,
	getClientCompanyByClientId,
	getClientProfileByStaffUserId,
	getClientProfilebyUserId,
	getClientStaffProfilebyUserId,
	getPendingInvitesForCompany,
	getStaffLocationsWithMeta
} from '$lib/server/database/queries/clients';

export const newStaffInvitesSchema = z.object({
	invitees: z
		.array(
			z.object({
				email: z.string().email({ message: 'Please enter a valid email address' }),
				staffRole: z.enum(['CLIENT_ADMIN', 'CLIENT_MANAGER', 'CLIENT_EMPLOYEE'], {
					required_error: 'Please select a staff role',
					invalid_type_error: 'Please select a valid staff role'
				})
			})
		)
		.min(1, 'Please add at least one staff member')
});

/** Null when this user can't manage the team (not a practice owner or CLIENT_ADMIN). */
export async function loadTeam(user: AppUser) {
	if (user.role !== USER_ROLES.CLIENT && user.role !== USER_ROLES.CLIENT_STAFF) return null;
	const staffProfile = user.role === USER_ROLES.CLIENT_STAFF ? await getClientStaffProfilebyUserId(user.id) : null;
	if (user.role === USER_ROLES.CLIENT_STAFF && staffProfile?.staffRole !== 'CLIENT_ADMIN') return null;

	const clientProfile =
		user.role === USER_ROLES.CLIENT ? await getClientProfilebyUserId(user.id) : await getClientProfileByStaffUserId(user.id);
	const company = await getClientCompanyByClientId(clientProfile?.id);

	const [staff, companyLocations, pendingInvites, inviteForm] = await Promise.all([
		getAllClientStaffProfiles(company.id),
		getAllClientLocationsByCompanyId(company.id),
		getPendingInvitesForCompany(company.id),
		superValidate(newStaffInvitesSchema)
	]);
	const staffWithLocations = await Promise.all(
		(staff ?? []).map(async (member) => {
			const assignments = await getStaffLocationsWithMeta(member.profile.id);
			return {
				...member,
				locationAssignments: assignments.map((a) => ({
					locationId: a.locationId,
					isPrimary: !!a.isPrimary,
					locationName: a.locationName
				}))
			};
		})
	);

	return { staff: staffWithLocations, companyLocations, pendingInvites, inviteForm };
}
