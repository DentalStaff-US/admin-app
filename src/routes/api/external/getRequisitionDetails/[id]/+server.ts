import db from '$lib/server/database/drizzle';
import { candidateProfileTable } from '$lib/server/database/schemas/candidate';
import {
	companyOfficeLocationTable,
	clientCompanyTable,
	clientProfileTable
} from '$lib/server/database/schemas/client';
import {
	requisitionTable,
	requisitionApplicationTable,
	workdayTable
} from '$lib/server/database/schemas/requisition';
import { disciplineTable } from '$lib/server/database/schemas/skill';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { and, eq, gte, isNull, ne, or } from 'drizzle-orm';
import { clientIsActiveCondition } from '$lib/server/clientStatusGuards';
import { authenticateUser } from '$lib/server/serverUtils';
import { logger } from '$lib/server/logger';
import {
	isApplicationUnlocked,
	maskLocation,
	maskedCompany,
	scrubContactDetails
} from '$lib/server/privacy/clientIdentity';

/**
 * Candidate-facing requisition details. Auth'd because the response shape +
 * filter behavior depends on whether the requesting candidate has applied:
 *
 *   - Applicants ALWAYS see the requisition they applied to, even if its
 *     owning business has since gone INACTIVE or the req moved past OPEN
 *     into CANCELED/CLOSED/PAYMENT_REQUIRED/PAYMENT_RECEIVED — they need to
 *     track application status forever (history).
 *   - Non-applicants see OPEN reqs from active businesses, plus terminal-
 *     state reqs only within the current calendar year (so a stale CLOSED
 *     req from a prior year doesn't show on a direct URL).
 *
 * The response always includes `application: { id, status, createdAt } | null`
 * so the candidate UI can pick the right banner without a second round-trip.
 *
 * Lifecycle handling lives in the candidate svelte; this endpoint just
 * decides who is allowed to see which row.
 */
export const GET: RequestHandler = async ({ request, params }) => {
	const { id } = params;
	if (!id) throw error(400, 'No ID provided');
	const numId = Number(id);
	if (!Number.isFinite(numId)) throw error(400, 'Invalid requisition id');

	const user = await authenticateUser(request);

	try {
		// 1. Resolve the candidate's application for this req, if any. Drives
		//    both the visibility bypass and the banner the UI renders.
		const [application] = await db
			.select({
				id: requisitionApplicationTable.id,
				status: requisitionApplicationTable.status,
				createdAt: requisitionApplicationTable.createdAt
			})
			.from(requisitionApplicationTable)
			.innerJoin(
				candidateProfileTable,
				eq(candidateProfileTable.id, requisitionApplicationTable.candidateId)
			)
			.where(
				and(
					eq(requisitionApplicationTable.requisitionId, numId),
					eq(candidateProfileTable.userId, user.id)
				)
			)
			.limit(1);
		const hasApplication = !!application;

		// 2. Calendar-year cutoff: only enforced for non-applicants. Reqs with
		//    `updatedAt` before Jan 1 of the current year and status != OPEN
		//    are stale and hidden.
		const yearStart = new Date(new Date().getFullYear(), 0, 1);

		const requisition = await db
			.select({
				id: requisitionTable.id,
				// `title` is a deprecated column; new code should display
				// `disciplineName` instead.
				title: requisitionTable.title,
				disciplineName: disciplineTable.name,
				status: requisitionTable.status,
				jobDescription: requisitionTable.jobDescription,
				specialInstructions: requisitionTable.specialInstructions,
				hourlyRate: requisitionTable.hourlyRate,
				disciplineId: requisitionTable.disciplineId,
				experienceLevelId: requisitionTable.experienceLevelId,
				createdAt: requisitionTable.createdAt,
				updatedAt: requisitionTable.updatedAt,
				permanentPosition: requisitionTable.permanentPosition,
				company: { ...clientCompanyTable },
				location: { ...companyOfficeLocationTable }
			})
			.from(requisitionTable)
			.innerJoin(clientCompanyTable, eq(requisitionTable.companyId, clientCompanyTable.id))
			.innerJoin(clientProfileTable, eq(clientProfileTable.id, clientCompanyTable.clientId))
			.innerJoin(
				companyOfficeLocationTable,
				eq(requisitionTable.locationId, companyOfficeLocationTable.id)
			)
			.innerJoin(disciplineTable, eq(requisitionTable.disciplineId, disciplineTable.id))
			.where(
				and(
					eq(requisitionTable.id, numId),
					eq(requisitionTable.archived, false),
					// PENDING is the admin-draft state; never expose to candidates.
					ne(requisitionTable.status, 'PENDING'),
					// Applicants bypass the client-active filter (they need to see
					// their application even if the business went inactive).
					hasApplication ? undefined : clientIsActiveCondition,
					// Non-applicants don't see stale (prior-year) terminal-state reqs.
					hasApplication
						? undefined
						: or(eq(requisitionTable.status, 'OPEN'), gte(requisitionTable.updatedAt, yearStart))
				)
			)
			.limit(1);

		if (!requisition.length) throw error(404, 'No Requisition Found');

		const row = requisition[0];

		// 3. Practice identity unlocks per-shift: an APPROVED application on a
		//    permanent posting, or a live workday the candidate holds on this
		//    requisition. Reaching the detail page by id is not enough — this is
		//    the endpoint a harvester would hit directly with a guessed id.
		const [heldWorkday] = await db
			.select({ id: workdayTable.id })
			.from(workdayTable)
			.innerJoin(candidateProfileTable, eq(candidateProfileTable.id, workdayTable.candidateId))
			.where(
				and(
					eq(workdayTable.requisitionId, numId),
					eq(candidateProfileTable.userId, user.id),
					isNull(workdayTable.cancelledAt)
				)
			)
			.limit(1);

		const unlocked = isApplicationUnlocked(application) || Boolean(heldWorkday);

		if (!unlocked) {
			return json({
				...row,
				title: null,
				company: maskedCompany,
				location: maskLocation(row.location, row.location?.id ?? `req-${row.id}`),
				// Client-authored copy: strip contact details, and hold back the
				// on-site instructions entirely until the shift is actually held.
				jobDescription: scrubContactDetails(row.jobDescription),
				specialInstructions: null,
				identityLocked: true,
				application: application ?? null
			});
		}

		return json({ ...row, identityLocked: false, application: application ?? null });
	} catch (err) {
		// Re-throw SvelteKit errors (404/400) as-is; only wrap unexpected throws.
		if (err && typeof err === 'object' && 'status' in err && 'body' in err) throw err;
		logger.error('getRequisitionDetails failed', { error: err, requisitionId: params.id });
		throw error(500, 'Internal server error');
	}
};
