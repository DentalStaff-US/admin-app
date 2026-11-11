/**
 * Practice dashboard loader for owners (CLIENT, CLIENT_ADMIN staff) and scoped staff
 * (10 §4). One loader for both roles: they differ only in the scope object, which
 * comes from the existing tenancy rule in scoping.ts.
 */
import { error, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { superValidate } from 'sveltekit-superforms/server';
import { clientCanCreateRequisitions, USER_ROLES, type ClientStatus } from '$lib/config/constants';
import { clientRequisitionSchema } from '$lib/config/zod-schemas';
import { hasBillingSetup } from '$lib/_helpers/billing';
import type { AppUser } from '$lib/server/auth';
import db from '$lib/server/database/drizzle';
import { clientSubscriptionTable } from '$lib/server/database/schemas/client';
import { monthBounds, pickNotice } from '../practice';
import { hasNoLocations } from '../scope';
import { nextBusinessDays } from '../window';
import { shiftsOnDays } from './coverage';
import { practiceAttention, practiceGlance } from './practice';
import { resolveClientScope } from './scope';
import { settle } from './settle';

export const UPCOMING_DAYS = 14;

export async function loadClientDashboard(user: AppUser & { completedOnboarding?: boolean | null }, url: URL) {
	const isOwner = user.role === USER_ROLES.CLIENT;
	if (isOwner && !user.completedOnboarding) redirect(302, '/onboarding/client/company');

	const resolved = await resolveClientScope(user, url.searchParams.get('location'));
	if (!resolved) {
		if (!isOwner) redirect(302, '/');
		error(400, 'Client ID required');
	}
	const { scope, client } = resolved;
	const now = new Date();
	const clientStatus = (client.status ?? 'PENDING') as ClientStatus;
	const canCreateRequisitions = clientCanCreateRequisitions(clientStatus);
	const invoiceMethod = client.clientInvoiceMethod ?? null;

	// Billing setup is the owner's job (unchanged: staff never saw this banner).
	const [subscription] = isOwner
		? await db.select().from(clientSubscriptionTable).where(eq(clientSubscriptionTable.clientId, client.id)).limit(1)
		: [null];

	const notice = pickNotice({
		status: clientStatus,
		canCreateRequisitions,
		isOwner,
		billingSetUp: hasBillingSetup(subscription ?? null),
		invoiceMethod
	});

	const base = {
		audience: 'practice' as const,
		scope,
		isOwner,
		clientStatus,
		canCreateRequisitions,
		notice,
		clientForm: canCreateRequisitions && scope.can.postRequests ? await superValidate(clientRequisitionSchema) : null
	};

	// No assignments: one empty state, no zeros (10 §4.2 rule 6).
	if (hasNoLocations(scope)) {
		return { ...base, noLocations: true as const, attention: [], upcoming: null, upcomingDays: [], glance: null };
	}

	const upcomingDays = nextBusinessDays(UPCOMING_DAYS, now);
	const upcoming = settle('upcoming', () => shiftsOnDays(scope, upcomingDays));
	const glance = practiceGlance(scope, monthBounds(now), now);
	const attention = await practiceAttention(scope, { userId: user.id, isOwner, invoiceMethod }, now);

	return { ...base, noLocations: false as const, attention, upcoming, upcomingDays, glance };
}
