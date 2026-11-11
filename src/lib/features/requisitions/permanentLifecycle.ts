/**
 * The permanent-hiring lifecycle (design doc 06 › Permanent hiring), derived
 * from data that already exists: the request status, its applications and the
 * professionals' saves. Pure and framework-free so the request page, the admin
 * pipeline page and the professional's Permanent tab can't disagree.
 *
 *   Posted → Interested → Applied / Recommended → Hired → Fee received
 *
 * Exits (a denied application, a canceled or closed request) are shown next to
 * the stage the request had reached, not as a stage of their own.
 */

export type ApplicationStatus = 'PENDING' | 'APPROVED' | 'DENIED';
export type ApplicationSource = 'CANDIDATE' | 'ADMIN_RECOMMENDED';

/** Where one person stands on one permanent request. */
export type ApplicantStage = 'INTERESTED' | 'RECOMMENDED' | 'APPLIED' | 'HIRED' | 'DENIED';

/** The request-level steps, in order. */
export const LIFECYCLE_STEPS = ['POSTED', 'INTERESTED', 'APPLIED', 'HIRED', 'FEE'] as const;
export type LifecycleStep = (typeof LIFECYCLE_STEPS)[number];

export type Audience = 'admin' | 'practice';

/** An application as the lifecycle needs it. */
export type ApplicationLike = {
	status: ApplicationStatus | string | null;
	source?: ApplicationSource | string | null;
};

/**
 * An application's stage. A PENDING application is Recommended when an admin
 * put the professional forward, Applied when they applied themselves.
 */
export function applicationStage(app: ApplicationLike): Exclude<ApplicantStage, 'INTERESTED'> {
	if (app.status === 'APPROVED') return 'HIRED';
	if (app.status === 'DENIED') return 'DENIED';
	return app.source === 'ADMIN_RECOMMENDED' ? 'RECOMMENDED' : 'APPLIED';
}

export type StageCounts = {
	/** Saved the request but haven't applied or been recommended. */
	interested: number;
	applied: number;
	recommended: number;
	hired: number;
	denied: number;
};

export const EMPTY_COUNTS: StageCounts = {
	interested: 0,
	applied: 0,
	recommended: 0,
	hired: 0,
	denied: 0
};

/**
 * Counts per stage. Each person is counted once: a professional who saved the
 * request and then applied counts as Applied, not also as Interested, so the
 * stages partition the people in the running.
 */
export function countStages(
	applications: (ApplicationLike & { candidateId: string })[],
	savedCandidateIds: string[]
): StageCounts {
	const counts = { ...EMPTY_COUNTS };
	const withApplication = new Set<string>();
	for (const app of applications) {
		withApplication.add(app.candidateId);
		const stage = applicationStage(app);
		if (stage === 'HIRED') counts.hired++;
		else if (stage === 'DENIED') counts.denied++;
		else if (stage === 'RECOMMENDED') counts.recommended++;
		else counts.applied++;
	}
	counts.interested = new Set(savedCandidateIds.filter((id) => !withApplication.has(id))).size;
	return counts;
}

export type RequestStatus =
	| 'PENDING'
	| 'OPEN'
	| 'CANCELED'
	| 'CLOSED'
	| 'PAYMENT_REQUIRED'
	| 'PAYMENT_RECEIVED';

/**
 * The furthest step a permanent request has reached. PENDING hasn't been posted
 * yet (index 0, not done); PAYMENT_RECEIVED is the end of the line (every step
 * done). A canceled or closed request keeps the step its people had reached.
 */
export function currentStep(status: RequestStatus | string | null, counts: StageCounts): number {
	if (status === 'PAYMENT_RECEIVED') return LIFECYCLE_STEPS.length - 1;
	if (status === 'PAYMENT_REQUIRED' || counts.hired > 0) return 3;
	if (status === 'PENDING') return 0;
	if (counts.applied + counts.recommended > 0) return 2;
	if (counts.interested > 0) return 1;
	return 0;
}

/** True when every step is done: the fee has been received. */
export function isComplete(status: RequestStatus | string | null): boolean {
	return status === 'PAYMENT_RECEIVED';
}

/** True when the request left the lifecycle early. */
export function isExited(status: RequestStatus | string | null): boolean {
	return status === 'CANCELED' || status === 'CLOSED';
}

export type FeeState = 'NONE' | 'NOT_INVOICED' | 'INVOICED' | 'RECEIVED';

/**
 * Perm billing is manual: an approval moves the request to PAYMENT_REQUIRED and
 * an admin flips it to PAYMENT_RECEIVED. PAYMENT_REQUIRED with no non-void
 * invoice is an uncollected placement fee (see requisitions/unbilled.ts).
 */
export function feeState(status: RequestStatus | string | null, unbilled: boolean): FeeState {
	if (status === 'PAYMENT_RECEIVED') return 'RECEIVED';
	if (status === 'PAYMENT_REQUIRED') return unbilled ? 'NOT_INVOICED' : 'INVOICED';
	return 'NONE';
}

export const FEE_LABEL: Record<FeeState, string> = {
	NONE: '—',
	NOT_INVOICED: 'Not invoiced',
	INVOICED: 'Invoiced',
	RECEIVED: 'Received'
};

export type LifecycleStepView = {
	key: LifecycleStep;
	label: string;
	/** Null when the step has no count (Posted, Fee). */
	count: number | null;
	/** Secondary line, e.g. "2 recommended". */
	detail?: string;
	/** Where the count links: exactly the set it counts. */
	href?: string;
	hint: string;
};

/**
 * The Stepper's steps for one request. Practices see the Interested count but
 * never names (saving a job isn't consent to be contacted), and see their
 * invoice where admins see the fee.
 */
export function lifecycleSteps(opts: {
	requisitionId: number | string;
	audience: Audience;
	counts: StageCounts;
	fee: FeeState;
}): LifecycleStepView[] {
	const { requisitionId, audience, counts, fee } = opts;
	const base = `/requisitions/${requisitionId}`;
	const stageHref = (stage: string) => `${base}?tab=applicants&stage=${stage}`;
	const inPlay = counts.applied + counts.recommended;
	return [
		{
			key: 'POSTED',
			label: 'Posted',
			count: null,
			hint: 'The request is live on the job board once it is open.'
		},
		{
			key: 'INTERESTED',
			label: 'Interested',
			count: counts.interested,
			href: stageHref('interested'),
			hint:
				audience === 'admin'
					? 'Professionals who saved this request but have not applied.'
					: 'Professionals who saved this request. Saving is not consent to be contacted, so names stay private.'
		},
		{
			key: 'APPLIED',
			label: 'Applied',
			count: inPlay,
			detail: counts.recommended ? `${counts.recommended} recommended` : undefined,
			href: stageHref('applied'),
			hint: 'Applications waiting for a decision, including professionals our team recommended.'
		},
		{
			key: 'HIRED',
			label: 'Hired',
			count: counts.hired,
			href: stageHref('hired'),
			hint: 'An approved applicant. Approving moves the request to payment required.'
		},
		{
			key: 'FEE',
			label: audience === 'admin' ? 'Fee received' : 'Placement fee',
			count: null,
			detail: fee === 'NONE' ? undefined : FEE_LABEL[fee],
			href: `${base}?tab=billing`,
			hint:
				audience === 'admin'
					? 'Marked by an admin when the placement fee is paid.'
					: 'Your placement fee invoice, once a hire is made.'
		}
	];
}

/** The applicant groups on a request's Applicants tab, in display order. */
export const APPLICANT_GROUP_ORDER: ApplicantStage[] = [
	'RECOMMENDED',
	'APPLIED',
	'HIRED',
	'DENIED',
	'INTERESTED'
];

export const STAGE_LABEL: Record<ApplicantStage, string> = {
	INTERESTED: 'Interested',
	RECOMMENDED: 'Recommended',
	APPLIED: 'Applied',
	HIRED: 'Hired',
	DENIED: 'Denied'
};

/** The `?stage=` values a count links to, mapped to the groups they show. */
export const STAGE_PARAM: Record<string, ApplicantStage[]> = {
	interested: ['INTERESTED'],
	applied: ['RECOMMENDED', 'APPLIED'],
	recommended: ['RECOMMENDED'],
	hired: ['HIRED'],
	denied: ['DENIED']
};

export function parseStageParam(value: string | null | undefined): ApplicantStage[] | null {
	if (!value) return null;
	return STAGE_PARAM[value] ?? null;
}

/**
 * Groups applications by stage in display order, dropping empty groups.
 * `only` narrows to the set a count linked to.
 */
export function groupApplicants<T extends ApplicationLike>(
	applications: T[],
	only?: ApplicantStage[] | null
): { stage: ApplicantStage; items: T[] }[] {
	const groups = new Map<ApplicantStage, T[]>();
	for (const app of applications) {
		const stage = applicationStage(app);
		if (!groups.has(stage)) groups.set(stage, []);
		groups.get(stage)!.push(app);
	}
	return APPLICANT_GROUP_ORDER.filter((stage) => stage !== 'INTERESTED')
		.filter((stage) => !only || only.includes(stage))
		.map((stage) => ({ stage, items: groups.get(stage) ?? [] }))
		.filter((group) => group.items.length > 0);
}

export type StageAction = 'RECOMMEND' | 'APPROVE' | 'DENY';

/**
 * The actions a row offers. Approve/Deny need requisition rights, a pending
 * application and a live (pending or open) request; Recommend is admin-only, for an interested professional on an
 * open request (the server re-checks consent, blacklist and duplicates).
 */
export function stageActions(opts: {
	stage: ApplicantStage;
	audience: Audience;
	canManage: boolean;
	requestStatus: RequestStatus | string | null;
}): StageAction[] {
	const { stage, audience, canManage, requestStatus } = opts;
	if (!canManage) return [];
	if (stage === 'INTERESTED') {
		return audience === 'admin' && requestStatus === 'OPEN' ? ['RECOMMEND'] : [];
	}
	// Only while the request is live: after a hire the others were auto-declined,
	// and a closed or canceled request has no one left to decide on.
	if ((stage === 'APPLIED' || stage === 'RECOMMENDED') && (requestStatus === 'OPEN' || requestStatus === 'PENDING')) {
		return ['APPROVE', 'DENY'];
	}
	return [];
}

/**
 * What the Interested group may show. Practices get a count only: the server
 * never sends them names, and this guards the UI if it ever did.
 */
export function interestedView<T>(
	audience: Audience,
	people: T[] | null | undefined,
	count: number
): { count: number; people: T[] } {
	if (audience !== 'admin') return { count, people: [] };
	return { count, people: people ?? [] };
}

/** One row of the admin pipeline board: which column a request sits in. */
export function boardColumn(
	status: RequestStatus | string | null,
	counts: StageCounts
): LifecycleStep {
	return LIFECYCLE_STEPS[currentStep(status, counts)];
}
