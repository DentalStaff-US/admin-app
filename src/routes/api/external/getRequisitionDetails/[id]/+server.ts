import db from '$lib/server/database/drizzle';
import {
	companyOfficeLocationTable,
	clientCompanyTable
} from '$lib/server/database/schemas/client';
import { requisitionTable } from '$lib/server/database/schemas/requisition';
import { disciplineTable } from '$lib/server/database/schemas/skill';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { eq, and } from 'drizzle-orm';

export const GET: RequestHandler = async ({ params }) => {
	const { id } = params;

	if (!id) {
		throw error(500, 'No ID provided');
	}

	const numId = +id;

	try {
		const requisition = await db
			.select({
				id: requisitionTable.id,
				// `title` is a deprecated column; new code should display
				// `disciplineName` instead. Kept here for any downstream
				// consumer still reading it.
				title: requisitionTable.title,
				disciplineName: disciplineTable.name,
				status: requisitionTable.status,
				jobDescription: requisitionTable.jobDescription,
				specialInstructions: requisitionTable.specialInstructions,
				hourlyRate: requisitionTable.hourlyRate,
				disciplineId: requisitionTable.disciplineId,
				experienceLevelId: requisitionTable.experienceLevelId,
				createdAt: requisitionTable.createdAt,
				permanentPosition: requisitionTable.permanentPosition,
				company: {
					...clientCompanyTable
				},
				location: {
					...companyOfficeLocationTable
				}
			})
			.from(requisitionTable)
			.innerJoin(clientCompanyTable, eq(requisitionTable.companyId, clientCompanyTable.id))
			.innerJoin(
				companyOfficeLocationTable,
				eq(requisitionTable.locationId, companyOfficeLocationTable.id)
			)
			.innerJoin(disciplineTable, eq(requisitionTable.disciplineId, disciplineTable.id))
			.where(
				and(
					eq(requisitionTable.id, numId),
					eq(requisitionTable.status, 'OPEN'),
					eq(requisitionTable.archived, false)
				)
			)
			.limit(1);

		if (!requisition.length) {
			throw error(404, 'No Requisition Found');
		}

		return json(requisition[0]);
	} catch (err) {
		console.error('Error fetching requisitions:', err);
		throw error(500, 'Internal server error');
	}
};
