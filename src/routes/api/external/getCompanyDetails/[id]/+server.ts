import db from '$lib/server/database/drizzle';
import {
	clientCompanyTable,
	companyOfficeLocationTable
} from '$lib/server/database/schemas/client';
import { requisitionTable } from '$lib/server/database/schemas/requisition';
import { disciplineTable } from '$lib/server/database/schemas/skill';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { logger } from '$lib/server/logger';

export const GET: RequestHandler = async ({ params }) => {
	const { id } = params;

	if (!id) {
		throw error(500, 'No ID provided');
	}

	try {
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

		return json({ company: company[0], requisitions });
	} catch (err) {
		logger.error('getCompanyDetails failed', { error: err, companyId: params.id });
		throw error(500, 'Internal server error');
	}
};
