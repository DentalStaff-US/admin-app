import db from '$lib/server/database/drizzle';
import { candidateProfileTable } from '$lib/server/database/schemas/candidate';
import {
	clientCompanyTable,
	companyOfficeLocationTable
} from '$lib/server/database/schemas/client';
import {
	requisitionApplicationTable,
	requisitionTable,
	workdayTable
} from '$lib/server/database/schemas/requisition';
import { disciplineTable } from '$lib/server/database/schemas/skill';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { isClientActiveByCompanyId } from '$lib/server/clientStatusGuards';
import { authenticateUser } from '$lib/server/serverUtils';
import { logger } from '$lib/server/logger';

/**
 * Full practice profile — name, address, phone, hours. This is the richest
 * client-identity payload in the candidate API, and it used to be served
 * unauthenticated to anyone holding a company id. It now requires a candidate
 * who already works with the practice:
 *
 *   - a live (non-cancelled) workday on one of its requisitions, or
 *   - an APPROVED application on one of its permanent postings.
 *
 * Everyone else gets a 404 — identical to a company that doesn't exist, so the
 * endpoint can't be walked to confirm which ids are real.
 */
export const GET: RequestHandler = async ({ request, params }) => {
	const { id } = params;

	if (!id) {
		throw error(400, 'No ID provided');
	}

	const user = await authenticateUser(request);

	try {
		// Candidates may only view companies whose owning business is ACTIVE.
		// 404 (not 403) so we don't reveal that the company exists at all.
		if (!(await isClientActiveByCompanyId(id))) {
			throw error(404, 'No Company Found');
		}

		const [candidateProfile] = await db
			.select({ id: candidateProfileTable.id })
			.from(candidateProfileTable)
			.where(eq(candidateProfileTable.userId, user.id))
			.limit(1);

		if (!candidateProfile) {
			throw error(404, 'No Company Found');
		}

		const [heldWorkday] = await db
			.select({ id: workdayTable.id })
			.from(workdayTable)
			.innerJoin(requisitionTable, eq(requisitionTable.id, workdayTable.requisitionId))
			.where(
				and(
					eq(workdayTable.candidateId, candidateProfile.id),
					eq(requisitionTable.companyId, id),
					isNull(workdayTable.cancelledAt)
				)
			)
			.limit(1);

		const [approvedApplication] = await db
			.select({ id: requisitionApplicationTable.id })
			.from(requisitionApplicationTable)
			.innerJoin(
				requisitionTable,
				eq(requisitionTable.id, requisitionApplicationTable.requisitionId)
			)
			.where(
				and(
					eq(requisitionApplicationTable.candidateId, candidateProfile.id),
					eq(requisitionApplicationTable.status, 'APPROVED'),
					eq(requisitionTable.companyId, id)
				)
			)
			.limit(1);

		if (!heldWorkday && !approvedApplication) {
			throw error(404, 'No Company Found');
		}

		const company = await db
			.select()
			.from(clientCompanyTable)
			.where(eq(clientCompanyTable.id, id))
			.limit(1);

		if (!company.length) {
			throw error(404, 'No Company Found');
		}

		// Fetch requisitions for the office locations in the candidate's region
		const requisitions = await db
			.select({
				id: requisitionTable.id,
				// `title` is deprecated — use `disciplineName` for display.
				title: requisitionTable.title,
				disciplineName: disciplineTable.name,
				status: requisitionTable.status,
				// jobDescription: requisitionTable.jobDescription,
				hourlyRate: requisitionTable.hourlyRate,
				disciplineId: requisitionTable.disciplineId,
				experienceLevelId: requisitionTable.experienceLevelId,
				createdAt: requisitionTable.createdAt,
				permanentPosition: requisitionTable.permanentPosition,
				location: {
					...companyOfficeLocationTable
				}
			})
			.from(requisitionTable)
			.innerJoin(
				companyOfficeLocationTable,
				eq(requisitionTable.locationId, companyOfficeLocationTable.id)
			)
			.innerJoin(disciplineTable, eq(requisitionTable.disciplineId, disciplineTable.id))
			.where(
				and(
					eq(requisitionTable.companyId, id),
					eq(requisitionTable.status, 'OPEN'),
					eq(requisitionTable.archived, false)
				)
			);

		return json({ company: company[0], requisitions, identityLocked: false });
	} catch (err) {
		// Re-throw SvelteKit errors (400/404) as-is; only wrap unexpected throws.
		if (err && typeof err === 'object' && 'status' in err && 'body' in err) throw err;
		logger.error('getCompanyDetails failed', { error: err, companyId: params.id });
		throw error(500, 'Internal server error');
	}
};
