/**
 * Where each practice's client agreement stands, for the admin dashboard.
 * Completed agreements (signed through Documenso, or uploaded by hand as an
 * AGREEMENT document) are left out: the panel only lists what still needs work.
 * Pure: the server reads rows and hands them here.
 */

export const AGREEMENT_STAGES = ['NOT_SENT', 'AWAITING_SIGNATURE', 'AWAITING_COUNTERSIGN'] as const;
export type AgreementStage = (typeof AGREEMENT_STAGES)[number];

export const AGREEMENT_STAGE_LABEL: Record<AgreementStage, string> = {
	NOT_SENT: 'Not sent',
	AWAITING_SIGNATURE: 'Sent, not signed',
	AWAITING_COUNTERSIGN: 'Waiting on countersignature'
};

/** For the narrow count tiles. */
export const AGREEMENT_STAGE_SHORT: Record<AgreementStage, string> = {
	NOT_SENT: 'Not sent',
	AWAITING_SIGNATURE: 'Unsigned',
	AWAITING_COUNTERSIGN: 'Countersign'
};

export type AgreementPractice = {
	clientId: string;
	name: string;
	clientCreatedAt: Date | string;
	/** The latest CLIENT_AGREEMENT request, if any. */
	latest: { status: string; sentAt: Date | string | null; subjectSignedAt: Date | string | null; createdAt: Date | string } | null;
	/** Any request for this practice ever completed. */
	everCompleted: boolean;
	/** An AGREEMENT document was uploaded by hand. */
	hasUploadedAgreement: boolean;
};

export type AgreementRow = { clientId: string; name: string; stage: AgreementStage; since: Date; href: string };
export type AgreementStatus = { counts: Record<AgreementStage, number>; rows: AgreementRow[] };

const WAITING_ON_PRACTICE = new Set(['PENDING', 'SENT', 'OPENED']);

export function agreementStage(p: AgreementPractice): { stage: AgreementStage; since: Date } | null {
	if (p.everCompleted || p.hasUploadedAgreement) return null;
	const latest = p.latest;
	if (latest?.status === 'AWAITING_COUNTERSIGN') {
		return { stage: 'AWAITING_COUNTERSIGN', since: new Date(latest.subjectSignedAt ?? latest.sentAt ?? latest.createdAt) };
	}
	if (latest && WAITING_ON_PRACTICE.has(latest.status)) {
		return { stage: 'AWAITING_SIGNATURE', since: new Date(latest.sentAt ?? latest.createdAt) };
	}
	// Never sent, or the last one was rejected, cancelled, expired or failed.
	return { stage: 'NOT_SENT', since: new Date(latest?.createdAt ?? p.clientCreatedAt) };
}

/** Rows grouped by stage, oldest first within a stage (they've waited longest). */
export function agreementStatus(practices: AgreementPractice[]): AgreementStatus {
	const counts = Object.fromEntries(AGREEMENT_STAGES.map((s) => [s, 0])) as Record<AgreementStage, number>;
	const rows: AgreementRow[] = [];
	for (const p of practices) {
		const s = agreementStage(p);
		if (!s) continue;
		counts[s.stage] += 1;
		rows.push({ clientId: p.clientId, name: p.name, ...s, href: `/clients/${p.clientId}?tab=documents` });
	}
	const order = (s: AgreementStage) => AGREEMENT_STAGES.indexOf(s);
	rows.sort((a, b) => order(a.stage) - order(b.stage) || a.since.getTime() - b.since.getTime());
	return { counts, rows };
}
