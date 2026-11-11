/**
 * The professional detail "Permanent" tab: what is this person in the running
 * for? Pure helpers; the query is server/permanent.ts › getCandidatePermanentActivity.
 */
import { applicationStage, type ApplicantStage } from './permanentLifecycle';

export type CandidatePermanentItem = {
	requisitionId: number;
	title: string | null;
	disciplineName: string;
	companyName: string;
	locationName: string;
	requestStatus: string;
	stage: ApplicantStage;
	/** When they saved it, or when the application was created. */
	at: Date | string;
	applicationId: string | null;
	savedAt: Date | string | null;
};

type ActivityBase = {
	requisitionId: number;
	title: string | null;
	requestStatus: string;
	disciplineName: string | null;
	companyName: string | null;
	locationName: string | null;
};

/**
 * One item per request: an application wins over a save (they moved past
 * Interested), keeping the save time for context. Newest first.
 */
export function mergeCandidateActivity(
	apps: (ActivityBase & {
		applicationId: string;
		status: string;
		source: string;
		createdAt: Date | string;
	})[],
	saves: (ActivityBase & { savedAt: Date | string })[]
): CandidatePermanentItem[] {
	const byReq = new Map<number, CandidatePermanentItem>();
	const base = (r: ActivityBase) => ({
		requisitionId: r.requisitionId,
		title: r.title,
		requestStatus: r.requestStatus,
		disciplineName: r.disciplineName ?? '',
		companyName: r.companyName ?? '',
		locationName: r.locationName ?? ''
	});
	for (const s of saves) {
		byReq.set(s.requisitionId, {
			...base(s),
			stage: 'INTERESTED',
			at: s.savedAt,
			applicationId: null,
			savedAt: s.savedAt
		});
	}
	for (const a of apps) {
		const saved = byReq.get(a.requisitionId)?.savedAt ?? null;
		byReq.set(a.requisitionId, {
			...base(a),
			stage: applicationStage(a),
			at: a.createdAt,
			applicationId: a.applicationId,
			savedAt: saved
		});
	}
	return [...byReq.values()].sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime());
}

/** "Still in the running" first (interested, recommended, applied), then outcomes. */
export function splitCandidateActivity(items: CandidatePermanentItem[]) {
	const live = new Set(['PENDING', 'OPEN']);
	const active = items.filter(
		(i) =>
			(i.stage === 'INTERESTED' || i.stage === 'APPLIED' || i.stage === 'RECOMMENDED') &&
			live.has(i.requestStatus)
	);
	const rest = items.filter((i) => !active.includes(i));
	return { active, rest };
}
