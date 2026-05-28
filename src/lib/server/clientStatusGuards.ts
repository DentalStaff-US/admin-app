// Candidate-facing access guards: professionals may only see/interact with
// requisitions, shifts, and companies whose owning business
// (client_profiles.status) is ACTIVE. Admins create requisitions for clients in
// any status, so these checks are the enforcement point for the candidate side.
//
// Resolution chain: requisition.companyId → client_companies.id →
// client_companies.clientId → client_profiles.id (.status).
//
// Scope (per product decision): gate DISCOVERY + NEW ACTIONS only (browse
// openings/temp shifts, company/requisition details, apply, claim). Do NOT use
// these to hide a candidate's EXISTING commitments (my-shifts, timesheets,
// prior applications) — a candidate must still complete/track work for a client
// that went inactive after they were already engaged.
import db from '$lib/server/database/drizzle';
import { clientProfileTable, clientCompanyTable } from '$lib/server/database/schemas/client';
import { requisitionTable, recurrenceDayTable } from '$lib/server/database/schemas/requisition';
import { eq } from 'drizzle-orm';

const ACTIVE = 'ACTIVE';

/**
 * Drizzle WHERE term for list queries that already inner-join `clientProfileTable`.
 * Add the join (`clientProfileTable.id === clientCompanyTable.clientId`) then
 * include this in the query's `and(...)`.
 */
export const clientIsActiveCondition = eq(clientProfileTable.status, ACTIVE);

export async function isClientActiveByCompanyId(companyId: string): Promise<boolean> {
	const [row] = await db
		.select({ status: clientProfileTable.status })
		.from(clientCompanyTable)
		.innerJoin(clientProfileTable, eq(clientProfileTable.id, clientCompanyTable.clientId))
		.where(eq(clientCompanyTable.id, companyId))
		.limit(1);
	return row?.status === ACTIVE;
}

export async function isClientActiveByRequisitionId(requisitionId: number): Promise<boolean> {
	const [row] = await db
		.select({ status: clientProfileTable.status })
		.from(requisitionTable)
		.innerJoin(clientCompanyTable, eq(clientCompanyTable.id, requisitionTable.companyId))
		.innerJoin(clientProfileTable, eq(clientProfileTable.id, clientCompanyTable.clientId))
		.where(eq(requisitionTable.id, requisitionId))
		.limit(1);
	return row?.status === ACTIVE;
}

export async function isClientActiveByRecurrenceDayId(recurrenceDayId: string): Promise<boolean> {
	const [row] = await db
		.select({ status: clientProfileTable.status })
		.from(recurrenceDayTable)
		.innerJoin(requisitionTable, eq(requisitionTable.id, recurrenceDayTable.requisitionId))
		.innerJoin(clientCompanyTable, eq(clientCompanyTable.id, requisitionTable.companyId))
		.innerJoin(clientProfileTable, eq(clientProfileTable.id, clientCompanyTable.clientId))
		.where(eq(recurrenceDayTable.id, recurrenceDayId))
		.limit(1);
	return row?.status === ACTIVE;
}
