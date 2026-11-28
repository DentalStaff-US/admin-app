import { USER_ROLES } from '$lib/config/constants';
import { redirectIfNotValidCustomer } from '$lib/server/database/queries/billing';
import {
	getClientProfileByStaffUserId,
	getClientProfilebyUserId
} from '$lib/server/database/queries/clients';
import { getClientInvoices, getAllInvoicesAdmin } from '$lib/server/database/queries/requisitions';
import { redirect } from '@sveltejs/kit';
import { getClientStaffScopedLocationIds } from '$lib/server/scoping';
import { readInvoiceListQuery, shapeInvoiceList, toInvoiceListRow } from '$features/invoices/invoices';
import { can } from '$lib/authz';

export const load = async (event) => {
	const { locals, url } = event;
	const searchTerm = url.searchParams.get('search') || '';

	const { user } = locals;
	if (!user) {
		redirect(302, '/auth/sign-in');
	}

	let invoices: any = [];

	if (can(user, 'invoices.read')) {
		invoices = await getAllInvoicesAdmin(searchTerm);
	} else if (user.role === USER_ROLES.CLIENT) {
		if (!user.completedOnboarding) {
			redirect(302, '/onboarding/client/company');
		}
		const client = await getClientProfilebyUserId(user.id);
		await redirectIfNotValidCustomer(client.id, user.role);
		invoices = await getClientInvoices(client?.id, { searchTerm });
	} else if (user.role === USER_ROLES.CLIENT_STAFF) {
		const client = await getClientProfileByStaffUserId(user.id);
		await redirectIfNotValidCustomer(client?.id, user.role);
		const scopedLocationIds = await getClientStaffScopedLocationIds(user);
		invoices = await getClientInvoices(client?.id, { searchTerm, locationIds: scopedLocationIds });
	}

	// Tab, filters, sort and page come from the URL.
	const query = readInvoiceListQuery(url);
	const list = shapeInvoiceList((invoices || []).map((row: unknown) => toInvoiceListRow(row)), query);

	return { user, isAdmin: can(user, 'invoices.read'), list, query, searchTerm };
};
