/**
 * Queries behind the permanent-hiring lifecycle (design doc 06): stage counts
 * per request, the Interested list, the admin pipeline page and the
 * professional's Permanent tab. No new tables: saves come from
 * candidate_saved_requisitions, stages from requisition_application.
 *
 * Note: saves are keyed (candidate_id, requisition_id), so per-request lookups
 * scan by the second column. The doc asks for an index on requisition_id if one
 * doesn't exist; it doesn't, and adding it is a schema change left to the lead.
 */
import { and, desc, eq, inArray, notInArray, sql, type SQL } from 'drizzle-orm';
import db from '$lib/server/database/drizzle';
import {
	candidateRequisitionSavesTable,
	requisitionApplicationTable,
	requisitionTable
} from '$lib/server/database/schemas/requisition';
import { candidateProfileTable } from '$lib/server/database/schemas/candidate';
import { userTable } from '$lib/server/database/schemas/auth';
import { clientCompanyTable, companyOfficeLocationTable } from '$lib/server/database/schemas/client';
import { disciplineTable } from '$lib/server/database/schemas/skill';
import { isUnbilledPlacementColumn } from '$lib/server/requisitions/unbilled';
import {
	applicationStage,
	countStages,
	EMPTY_COUNTS,
	feeState,
	type Audience,
	type FeeState,
	type StageCounts
} from '../permanentLifecycle';
import { mergeCandidateActivity, type CandidatePermanentItem } from '../candidatePermanent';

/** Stage counts for many requests in two grouped queries. */
export async function getStageCounts(requisitionIds: number[]): Promise<Map<number, StageCounts>> {
	const out = new Map<number, StageCounts>();
	if (requisitionIds.length === 0) return out;

	const [apps, saves] = await Promise.all([
		db
			.select({
				requisitionId: requisitionApplicationTable.requisitionId,
				candidateId: requisitionApplicationTable.candidateId,
				status: requisitionApplicationTable.status,
				source: requisitionApplicationTable.source
			})
			.from(requisitionApplicationTable)
			.where(
				and(
					inArray(requisitionApplicationTable.requisitionId, requisitionIds),
					eq(requisitionApplicationTable.archived, false)
				)
			),
		db
			.select({
				requisitionId: candidateRequisitionSavesTable.requisitionId,
				candidateId: candidateRequisitionSavesTable.candidateId
			})
			.from(candidateRequisitionSavesTable)
			.where(inArray(candidateRequisitionSavesTable.requisitionId, requisitionIds))
	]);

	for (const id of requisitionIds) {
		out.set(
			id,
			countStages(
				apps.filter((a) => a.requisitionId === id).map((a) => ({ ...a, status: a.status ?? 'PENDING' })),
				saves.filter((s) => s.requisitionId === id).map((s) => s.candidateId)
			)
		);
	}
	return out;
}

export type InterestedPerson = {
	candidateId: string;
	userId: string;
	firstName: string | null;
	lastName: string | null;
	avatarUrl: string | null;
	savedAt: Date;
};

/**
 * Lifecycle data for one permanent request's page. Names of the people who
 * saved it are loaded for admins only: practices get the count and nothing
 * else, so the names never reach their page data.
 */
export async function getRequestLifecycle(
	requisitionId: number,
	audience: Audience,
	opts: { status: string | null; unbilled?: boolean }
): Promise<{ counts: StageCounts; fee: FeeState; interested: InterestedPerson[] }> {
	const counts = (await getStageCounts([requisitionId])).get(requisitionId) ?? { ...EMPTY_COUNTS };
	const fee = feeState(opts.status, !!opts.unbilled);
	if (audience !== 'admin') return { counts, fee, interested: [] };

	const applied = db
		.select({ id: requisitionApplicationTable.candidateId })
		.from(requisitionApplicationTable)
		.where(eq(requisitionApplicationTable.requisitionId, requisitionId));

	const interested = await db
		.select({
			candidateId: candidateRequisitionSavesTable.candidateId,
			userId: userTable.id,
			firstName: userTable.firstName,
			lastName: userTable.lastName,
			avatarUrl: userTable.avatarUrl,
			savedAt: candidateRequisitionSavesTable.savedAt
		})
		.from(candidateRequisitionSavesTable)
		.innerJoin(candidateProfileTable, eq(candidateProfileTable.id, candidateRequisitionSavesTable.candidateId))
		.innerJoin(userTable, eq(userTable.id, candidateProfileTable.userId))
		.where(
			and(
				eq(candidateRequisitionSavesTable.requisitionId, requisitionId),
				notInArray(candidateRequisitionSavesTable.candidateId, applied)
			)
		)
		.orderBy(desc(candidateRequisitionSavesTable.savedAt));

	return { counts, fee, interested };
}

/** Whether a request is unbilled (admin view of the Fee step). */
export async function isRequestUnbilled(requisitionId: number): Promise<boolean> {
	const [row] = await db
		.select({ unbilled: isUnbilledPlacementColumn() })
		.from(requisitionTable)
		.where(eq(requisitionTable.id, requisitionId));
	return !!row?.unbilled;
}

export const PIPELINE_ACTIVE_STATUSES = ['PENDING', 'OPEN', 'PAYMENT_REQUIRED'] as const;
export const PIPELINE_DONE_STATUSES = ['PAYMENT_RECEIVED', 'CLOSED', 'CANCELED'] as const;

export type PipelineRow = {
	id: number;
	title: string | null;
	status: string;
	createdAt: Date;
	companyId: string;
	companyName: string;
	locationId: string;
	locationName: string;
	disciplineName: string;
	fee: FeeState;
	counts: StageCounts;
};

/**
 * Admin pipeline: every permanent request, one row each, with its stage
 * counts. Admin-only: the route checks checkIsAdmin before calling this.
 */
export async function getPermanentPipeline(opts: { done: boolean }): Promise<PipelineRow[]> {
	const statuses = opts.done ? PIPELINE_DONE_STATUSES : PIPELINE_ACTIVE_STATUSES;
	const where: SQL[] = [
		eq(requisitionTable.permanentPosition, true),
		eq(requisitionTable.archived, false),
		inArray(requisitionTable.status, [...statuses])
	];
	const rows = await db
		.select({
			id: requisitionTable.id,
			title: requisitionTable.title,
			status: requisitionTable.status,
			createdAt: requisitionTable.createdAt,
			companyId: clientCompanyTable.id,
			companyName: clientCompanyTable.companyName,
			locationId: companyOfficeLocationTable.id,
			locationName: companyOfficeLocationTable.name,
			disciplineName: disciplineTable.name,
			unbilled: isUnbilledPlacementColumn()
		})
		.from(requisitionTable)
		.innerJoin(companyOfficeLocationTable, eq(requisitionTable.locationId, companyOfficeLocationTable.id))
		.innerJoin(clientCompanyTable, eq(companyOfficeLocationTable.companyId, clientCompanyTable.id))
		.innerJoin(disciplineTable, eq(requisitionTable.disciplineId, disciplineTable.id))
		.where(and(...where))
		.orderBy(desc(requisitionTable.createdAt))
		.limit(500);

	const counts = await getStageCounts(rows.map((r) => r.id));
	return rows.map(({ unbilled, ...r }) => ({
		...r,
		companyName: r.companyName ?? '',
		locationName: r.locationName ?? '',
		disciplineName: r.disciplineName ?? '',
		fee: feeState(r.status, !!unbilled),
		counts: counts.get(r.id) ?? { ...EMPTY_COUNTS }
	}));
}

/**
 * The professional detail "Permanent" tab: every permanent request a
 * professional saved or has an application on, with their stage on it.
 * Admin-only data (it names practices); call it from an admin-guarded load.
 */
export async function getCandidatePermanentActivity(
	candidateId: string
): Promise<CandidatePermanentItem[]> {
	const reqColumns = {
		requisitionId: requisitionTable.id,
		title: requisitionTable.title,
		requestStatus: requisitionTable.status,
		disciplineName: disciplineTable.name,
		companyName: clientCompanyTable.companyName,
		locationName: companyOfficeLocationTable.name
	};
	const [apps, saves] = await Promise.all([
		db
			.select({
				...reqColumns,
				applicationId: requisitionApplicationTable.id,
				status: requisitionApplicationTable.status,
				source: requisitionApplicationTable.source,
				createdAt: requisitionApplicationTable.createdAt
			})
			.from(requisitionApplicationTable)
			.innerJoin(requisitionTable, eq(requisitionApplicationTable.requisitionId, requisitionTable.id))
			.innerJoin(companyOfficeLocationTable, eq(requisitionTable.locationId, companyOfficeLocationTable.id))
			.innerJoin(clientCompanyTable, eq(companyOfficeLocationTable.companyId, clientCompanyTable.id))
			.innerJoin(disciplineTable, eq(requisitionTable.disciplineId, disciplineTable.id))
			.where(
				and(
					eq(requisitionApplicationTable.candidateId, candidateId),
					eq(requisitionTable.permanentPosition, true)
				)
			),
		db
			.select({ ...reqColumns, savedAt: candidateRequisitionSavesTable.savedAt })
			.from(candidateRequisitionSavesTable)
			.innerJoin(requisitionTable, eq(candidateRequisitionSavesTable.requisitionId, requisitionTable.id))
			.innerJoin(companyOfficeLocationTable, eq(requisitionTable.locationId, companyOfficeLocationTable.id))
			.innerJoin(clientCompanyTable, eq(companyOfficeLocationTable.companyId, clientCompanyTable.id))
			.innerJoin(disciplineTable, eq(requisitionTable.disciplineId, disciplineTable.id))
			.where(
				and(
					eq(candidateRequisitionSavesTable.candidateId, candidateId),
					eq(requisitionTable.permanentPosition, true),
					sql`${requisitionTable.archived} is not true`
				)
			)
	]);

	return mergeCandidateActivity(
		apps.map((a) => ({ ...a, status: a.status ?? 'PENDING' })),
		saves
	);
}
