import {
	clientCanCreateRequisitions,
	USER_ROLES,
	type ClientStatus
} from '$lib/config/constants.js';
import { hasBillingSetup } from '$lib/_helpers/billing';
import { clientSubscriptionTable } from '$lib/server/database/schemas/client';
import { getClientStaffScopedLocationIds } from '$lib/server/scoping';
import { redirect } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import {
	getClientDashboardData,
	getClientProfileByStaffUserId,
	getClientProfilebyUserId,
	getClientStaffProfilebyUserId
} from '$lib/server/database/queries/clients';
import { superValidate } from 'sveltekit-superforms/server';
import db from '$lib/server/database/drizzle';
import { invoiceTable, requisitionTable } from '$lib/server/database/schemas/requisition';
import { count, and, eq, lt, ne, sum, inArray } from 'drizzle-orm';
import { getAdminDashboardData } from '$lib/server/database/queries/admin';
import { adminRequisitionSchema, clientRequisitionSchema } from '$lib/config/zod-schemas';
import { adminNewUserSchema } from '$lib/config/zod-schemas';

export const load = async (event: RequestEvent) => {
	event.setHeaders({
		'cache-control': 'max-age=60'
	});

	const user = event.locals.user;
	if (!user) {
		redirect(302, '/auth/sign-in');
	}

	if (user.role === 'SUPERADMIN') {
		const {
			timesheetsDueCount,
			supportTickets,
			openSupportTicketsCount,
			discrepancies,
			newCandidateProfiles,
			newClientSignups,
			invoicesDueCount,
			invoicesDue,
			requisitions,
			wagesDueCount
		} = await getAdminDashboardData();
		const form = superValidate(event, adminRequisitionSchema);
		const newProfileForm = await superValidate(event, adminNewUserSchema);

		return {
			user,
			timesheetsDueCount,
			supportTickets,
			openSupportTicketsCount,
			discrepancies,
			requisitions,
			newCandidateProfiles,
			newClientSignups,
			invoicesDueCount,
			invoicesDue,
			clientForm: null,
			adminForm: form,
			newProfileForm,
			wagesDueCount
		};
	}

	if (user.role === USER_ROLES.CLIENT) {
		if (!user.completedOnboarding) {
			redirect(302, '/onboarding/client/company');
		}

		const client = await getClientProfilebyUserId(user.id);
		const {
			requisitions,
			supportTickets,
			newApplicationsCount,
			timesheetsDueCount,
			discrepanciesCount,
			positionApplications,
			timesheetsDue,
			invoices
		} = await getClientDashboardData(client?.id, user.id);

		const overdueInvoicesCount = await db
			.select({ count: count() })
			.from(invoiceTable)
			.where(
				and(
					eq(invoiceTable.clientId, client?.id),
					lt(invoiceTable.dueDate, new Date()),
					ne(invoiceTable.status, 'paid'),
					// Voided invoices are not collectible and must never count as overdue.
					ne(invoiceTable.status, 'void')
				)
			);

		const pendingInvoicesCount = await db
			.select({ count: count() })
			.from(invoiceTable)
			.where(and(eq(invoiceTable.clientId, client?.id), eq(invoiceTable.status, 'open')));

		const totalAmountDue = await db
			.select({ sum: sum(invoiceTable.amountDue) })
			.from(invoiceTable)
			.where(
				and(
					eq(invoiceTable.clientId, client?.id),
					ne(invoiceTable.status, 'paid'),
					ne(invoiceTable.status, 'void')
				)
			);
		const form = await superValidate(event, clientRequisitionSchema);
		const clientStatus = (client?.status ?? 'PENDING') as ClientStatus;

		const [subscription] = client
			? await db
					.select()
					.from(clientSubscriptionTable)
					.where(eq(clientSubscriptionTable.clientId, client.id))
					.limit(1)
			: [null];

		// TEMP DEBUG — investigating client reports of stale "pending approval"
		// banner even after admin sets status to ACTIVE. Remove after diagnosis.
		console.log('[dashboard CLIENT load]', {
			userId: user.id,
			userEmail: user.email,
			clientFound: !!client,
			clientId: client?.id ?? null,
			rawClientStatus: client?.status ?? null,
			resolvedClientStatus: clientStatus,
			canCreateRequisitions: clientCanCreateRequisitions(clientStatus),
			subscriptionFound: !!subscription,
			hasBillingSetup: hasBillingSetup(subscription ?? null)
		});

		return {
			user,
			profile: client,
			client,
			requisitions,
			recentApplications: positionApplications,
			supportTickets,
			newApplicationsCount,
			timesheetsDue,
			timesheetsDueCount,
			discrepanciesCount,
			invoices,
			totalAmountDue: totalAmountDue[0]?.sum,
			overdueInvoicesCount: overdueInvoicesCount[0]?.count,
			pendingInvoicesCount: pendingInvoicesCount[0]?.count,
			clientForm: form,
			adminForm: null,
			newProfileForm: null,
			wagesDueCount: 0,
			clientStatus,
			canCreateRequisitions: clientCanCreateRequisitions(clientStatus),
			hasBillingSetup: hasBillingSetup(subscription ?? null)
		};
	}

	if (user.role === USER_ROLES.CLIENT_STAFF) {
		const client = await getClientProfileByStaffUserId(user.id);
		const profile = await getClientStaffProfilebyUserId(user.id);

		if (!client) {
			return redirect(302, '/');
		}

		// Scope all CLIENT_STAFF reads to their assigned locations only. If the
		// staff has zero assignments, every list/count below returns empty.
		const scopedLocationIds = await getClientStaffScopedLocationIds(user);

		const {
			requisitions,
			supportTickets,
			newApplicationsCount,
			timesheetsDueCount,
			discrepanciesCount,
			positionApplications,
			timesheetsDue,
			invoices
		} = await getClientDashboardData(client?.id, user.id, scopedLocationIds);

		// Invoice counts are scoped by requisition.locationId via a join; if
		// the staff has zero assigned locations, all three counts are 0.
		const hasNoScope = Array.isArray(scopedLocationIds) && scopedLocationIds.length === 0;

		const overdueInvoicesCount = hasNoScope
			? [{ count: 0 }]
			: await db
					.select({ count: count() })
					.from(invoiceTable)
					.leftJoin(requisitionTable, eq(requisitionTable.id, invoiceTable.requisitionId))
					.where(
						and(
							eq(invoiceTable.clientId, client?.id),
							lt(invoiceTable.dueDate, new Date()),
							ne(invoiceTable.status, 'paid'),
							// Voided invoices are not collectible and must never count as overdue.
							ne(invoiceTable.status, 'void'),
							Array.isArray(scopedLocationIds)
								? inArray(requisitionTable.locationId, scopedLocationIds)
								: undefined
						)
					);

		const pendingInvoicesCount = hasNoScope
			? [{ count: 0 }]
			: await db
					.select({ count: count() })
					.from(invoiceTable)
					.leftJoin(requisitionTable, eq(requisitionTable.id, invoiceTable.requisitionId))
					.where(
						and(
							eq(invoiceTable.clientId, client.id),
							eq(invoiceTable.status, 'open'),
							Array.isArray(scopedLocationIds)
								? inArray(requisitionTable.locationId, scopedLocationIds)
								: undefined
						)
					);

		const totalAmountDue = hasNoScope
			? [{ sum: '0' }]
			: await db
					.select({ sum: sum(invoiceTable.amountDue) })
					.from(invoiceTable)
					.leftJoin(requisitionTable, eq(requisitionTable.id, invoiceTable.requisitionId))
					.where(
						and(
							eq(invoiceTable.clientId, client?.id),
							ne(invoiceTable.status, 'paid'),
							ne(invoiceTable.status, 'void'),
							Array.isArray(scopedLocationIds)
								? inArray(requisitionTable.locationId, scopedLocationIds)
								: undefined
						)
					);
		const form = await superValidate(event, clientRequisitionSchema);
		const clientStatus = (client?.status ?? 'PENDING') as ClientStatus;
		return {
			user,
			profile,
			client,
			requisitions,
			recentApplications: positionApplications,
			supportTickets,
			newApplicationsCount,
			timesheetsDue,
			timesheetsDueCount,
			discrepanciesCount,
			invoices,
			totalAmountDue: totalAmountDue[0]?.sum,
			overdueInvoicesCount: overdueInvoicesCount[0]?.count,
			pendingInvoicesCount: pendingInvoicesCount[0]?.count,
			clientForm: form,
			adminForm: null,
			newProfileForm: null,
			wagesDueCount: 0,
			clientStatus,
			canCreateRequisitions: clientCanCreateRequisitions(clientStatus)
		};
	}

	return {
		user,
		profile: null,
		client: null,
		requisitions: [],
		recentApplications: [],
		supportTickets: [],
		newApplicationsCount: 0,
		timesheetsDue: [],
		timesheetsDueCount: 0,
		discrepanciesCount: 0,
		invoices: [],
		totalAmountDue: 0,
		overdueInvoicesCount: 0,
		pendingInvoicesCount: 0,
		clientForm: null,
		adminForm: null,
		newProfileForm: null,
		wagesDueCount: 0,
		clientStatus: null,
		canCreateRequisitions: false
	};
};
