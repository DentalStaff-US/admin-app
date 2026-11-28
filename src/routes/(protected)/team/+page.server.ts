import { redirect } from '@sveltejs/kit';
import { loadTeam } from '$lib/features/settings/server/team';
import { actions as settings } from '../settings/+page.server';
import type { Actions } from './$types';

// Typed against the settings route; the handlers only read locals and the form.
const settingsActions = settings as unknown as Actions;

// The same team list as Settings › Team, as its own page in the sidebar.
export const load = async (event) => {
	const user = event.locals.user;
	if (!user) redirect(302, '/auth/sign-in');
	const team = await loadTeam(user);
	if (!team) redirect(302, '/dashboard');
	return team;
};

// The team forms post to ?/action, so this page answers the same actions.
export const actions = {
	sendClientStaffInvites: settingsActions.sendClientStaffInvites,
	updateStaffLocations: settingsActions.updateStaffLocations,
	resendStaffInvite: settingsActions.resendStaffInvite,
	revokeStaffInvite: settingsActions.revokeStaffInvite
};
