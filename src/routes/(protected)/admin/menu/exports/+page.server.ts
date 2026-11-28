import { redirect } from '@sveltejs/kit';
import { USER_ROLES } from '$lib/config/constants';
import { listExports } from '$lib/server/export/registry';
import { can } from '$lib/authz';

export async function load(event) {
	if (!can(event.locals.user, 'exports.run')) redirect(302, '/admin/menu');
	return { groups: listExports() };
}
