import { redirect } from '@sveltejs/kit';
import { USER_ROLES } from '$lib/config/constants';
import { listExports } from '$lib/server/export/registry';

export async function load(event) {
	if (event.locals.user?.role !== USER_ROLES.SUPERADMIN) redirect(302, '/admin/menu');
	return { groups: listExports() };
}
