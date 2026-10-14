import { and, eq } from 'drizzle-orm';
import db from '$lib/server/database/drizzle';
import {
	requisitionApplicationTable,
	requisitionTable
} from '$lib/server/database/schemas/requisition';
import { candidateProfileTable } from '$lib/server/database/schemas/candidate';
import { isCandidateBlacklisted } from '$lib/server/database/queries/blacklist';
import { getClientIdByCompanyId } from '$lib/server/database/queries/clients';
import { isClientActiveByCompanyId } from '$lib/server/clientStatusGuards';
import { recordAction } from '$lib/server/audit/audit';
import {
	notifyCandidateRecommended,
	notifyClientOfRecommendation
} from '$lib/server/notifications/transactional';
import { recommendationBlockReason } from './matchRules';

export const RECOMMENDATION_NOTE_MAX_LENGTH = 2000;

export type RecommendResult = { ok: true; applicationId: string } | { ok: false; message: string };

/**
 * An admin puts a vetted professional forward for a permanent requisition.
 *
 * The recommendation IS an application (source ADMIN_RECOMMENDED), so the client
 * reviews it in the Applications tab and Approve/Deny, auto-deny-others and
 * PAYMENT_REQUIRED billing all work unchanged. Consent is the admin's attestation
 * that the professional agreed in conversation; its timestamp is stored.
 *
 * Callers must already have authorised the admin (SUPERADMIN + requisition access).
 */
export async function recommendCandidate(input: {
	requisitionId: number;
	candidateId: string;
	note: string | null;
	consentConfirmed: boolean;
	adminUserId: string;
}): Promise<RecommendResult> {
	const [requisition] = await db
		.select({
			id: requisitionTable.id,
			status: requisitionTable.status,
			permanentPosition: requisitionTable.permanentPosition,
			companyId: requisitionTable.companyId
		})
		.from(requisitionTable)
		.where(eq(requisitionTable.id, input.requisitionId))
		.limit(1);

	const [candidate] = await db
		.select({ id: candidateProfileTable.id, status: candidateProfileTable.status })
		.from(candidateProfileTable)
		.where(eq(candidateProfileTable.id, input.candidateId))
		.limit(1);
	if (!candidate) return { ok: false, message: 'Professional not found.' };

	const [existing] = requisition
		? await db
				.select({ id: requisitionApplicationTable.id })
				.from(requisitionApplicationTable)
				.where(
					and(
						eq(requisitionApplicationTable.requisitionId, requisition.id),
						eq(requisitionApplicationTable.candidateId, candidate.id)
					)
				)
				.limit(1)
		: [];

	const blockReason = recommendationBlockReason({
		consentConfirmed: input.consentConfirmed,
		requisition: requisition ?? null,
		candidateStatus: candidate.status,
		clientActive: requisition ? await isClientActiveByCompanyId(requisition.companyId) : false,
		blacklisted: requisition
			? await isCandidateBlacklisted(candidate.id, requisition.companyId)
			: false,
		hasExistingApplication: !!existing
	});
	if (blockReason) return { ok: false, message: blockReason };

	const clientId = await getClientIdByCompanyId(requisition!.companyId);
	if (!clientId)
		return { ok: false, message: 'Could not resolve the client for this requisition.' };

	const now = new Date();
	const applicationId = crypto.randomUUID();
	await db.insert(requisitionApplicationTable).values({
		id: applicationId,
		createdAt: now,
		updatedAt: now,
		requisitionId: requisition!.id,
		candidateId: candidate.id,
		clientId,
		status: 'PENDING',
		source: 'ADMIN_RECOMMENDED',
		recommendedByUserId: input.adminUserId,
		recommendationNote: input.note?.trim() || null,
		candidateConsentAt: now
	});

	await recordAction({
		action: 'RECOMMEND',
		entityType: 'REQUISITION_APPLICATIONS',
		entityId: applicationId,
		after: { status: 'PENDING', source: 'ADMIN_RECOMMENDED' },
		metadata: { requisitionId: requisition!.id, candidateId: candidate.id }
	});

	void notifyClientOfRecommendation(applicationId);
	void notifyCandidateRecommended(applicationId);

	return { ok: true, applicationId };
}
