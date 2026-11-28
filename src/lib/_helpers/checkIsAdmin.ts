export function checkIsAdmin(role: string | null | undefined) {
	if (!role) {
		return false;
	}
	return ['SUPERADMIN', 'ADMIN'].includes(role);
}
