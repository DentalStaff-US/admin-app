import { describe, expect, it } from 'vitest';
import {
	applicationStage,
	boardColumn,
	countStages,
	currentStep,
	EMPTY_COUNTS,
	feeState,
	groupApplicants,
	interestedView,
	isComplete,
	isExited,
	lifecycleSteps,
	parseStageParam,
	stageActions
} from './permanentLifecycle';

const app = (candidateId: string, status: string, source = 'CANDIDATE') => ({
	candidateId,
	status,
	source
});

describe('applicationStage', () => {
	it('splits pending applications by source', () => {
		expect(applicationStage({ status: 'PENDING', source: 'CANDIDATE' })).toBe('APPLIED');
		expect(applicationStage({ status: 'PENDING', source: 'ADMIN_RECOMMENDED' })).toBe('RECOMMENDED');
		expect(applicationStage({ status: null })).toBe('APPLIED');
	});
	it('maps approved to hired and denied to denied, whatever the source', () => {
		expect(applicationStage({ status: 'APPROVED', source: 'ADMIN_RECOMMENDED' })).toBe('HIRED');
		expect(applicationStage({ status: 'DENIED', source: 'ADMIN_RECOMMENDED' })).toBe('DENIED');
	});
});

describe('countStages', () => {
	it('counts each person once: a saver who applied is not also interested', () => {
		const counts = countStages(
			[app('a', 'PENDING'), app('b', 'PENDING', 'ADMIN_RECOMMENDED'), app('c', 'DENIED')],
			['a', 'd', 'e', 'e']
		);
		expect(counts).toEqual({ interested: 2, applied: 1, recommended: 1, hired: 0, denied: 1 });
	});
	it('counts hires', () => {
		expect(countStages([app('a', 'APPROVED')], []).hired).toBe(1);
	});
});

describe('currentStep', () => {
	const c = (over: Partial<typeof EMPTY_COUNTS>) => ({ ...EMPTY_COUNTS, ...over });
	it('is Posted for a pending (not yet live) request even with saves', () => {
		expect(currentStep('PENDING', c({ interested: 3 }))).toBe(0);
	});
	it('walks forward on an open request as people arrive', () => {
		expect(currentStep('OPEN', c({}))).toBe(0);
		expect(currentStep('OPEN', c({ interested: 2 }))).toBe(1);
		expect(currentStep('OPEN', c({ interested: 2, recommended: 1 }))).toBe(2);
	});
	it('is Hired at PAYMENT_REQUIRED and the last step at PAYMENT_RECEIVED', () => {
		expect(currentStep('PAYMENT_REQUIRED', c({}))).toBe(3);
		expect(currentStep('PAYMENT_RECEIVED', c({}))).toBe(4);
		expect(isComplete('PAYMENT_RECEIVED')).toBe(true);
	});
	it('keeps the reached step for a closed request and flags the exit', () => {
		expect(currentStep('CLOSED', c({ applied: 1 }))).toBe(2);
		expect(isExited('CLOSED')).toBe(true);
		expect(isExited('CANCELED')).toBe(true);
		expect(isExited('OPEN')).toBe(false);
	});
	it('puts board cards in the matching column', () => {
		expect(boardColumn('OPEN', c({ interested: 1 }))).toBe('INTERESTED');
		expect(boardColumn('PAYMENT_RECEIVED', c({}))).toBe('FEE');
	});
});

describe('feeState', () => {
	it('separates uncollected fees from invoiced ones', () => {
		expect(feeState('PAYMENT_REQUIRED', true)).toBe('NOT_INVOICED');
		expect(feeState('PAYMENT_REQUIRED', false)).toBe('INVOICED');
		expect(feeState('PAYMENT_RECEIVED', false)).toBe('RECEIVED');
		expect(feeState('OPEN', true)).toBe('NONE');
	});
});

describe('lifecycleSteps', () => {
	const counts = { interested: 4, applied: 2, recommended: 1, hired: 0, denied: 1 };
	it('links every count to exactly the set it counts', () => {
		const steps = lifecycleSteps({ requisitionId: 7, audience: 'admin', counts, fee: 'NONE' });
		expect(steps.map((s) => s.key)).toEqual(['POSTED', 'INTERESTED', 'APPLIED', 'HIRED', 'FEE']);
		expect(steps[1]).toMatchObject({ count: 4, href: '/requisitions/7?tab=applicants&stage=interested' });
		expect(steps[2]).toMatchObject({ count: 3, detail: '1 recommended' });
		expect(steps[2].href).toBe('/requisitions/7?tab=applicants&stage=applied');
		expect(parseStageParam('applied')).toEqual(['RECOMMENDED', 'APPLIED']);
	});
	it('gives practices the interested count but labels the fee as their invoice', () => {
		const steps = lifecycleSteps({ requisitionId: 7, audience: 'practice', counts, fee: 'INVOICED' });
		expect(steps[1].count).toBe(4);
		expect(steps[1].hint).toMatch(/not consent/);
		expect(steps[4]).toMatchObject({ label: 'Placement fee', detail: 'Invoiced' });
	});
});

describe('groupApplicants', () => {
	const apps = [
		app('a', 'PENDING'),
		app('b', 'DENIED'),
		app('c', 'PENDING', 'ADMIN_RECOMMENDED'),
		app('d', 'APPROVED')
	];
	it('orders recommendations first, then applied, hired, denied', () => {
		expect(groupApplicants(apps).map((g) => g.stage)).toEqual(['RECOMMENDED', 'APPLIED', 'HIRED', 'DENIED']);
	});
	it('narrows to the linked set and drops empty groups', () => {
		expect(groupApplicants(apps, parseStageParam('hired')).map((g) => g.stage)).toEqual(['HIRED']);
		expect(groupApplicants([app('a', 'PENDING')]).map((g) => g.stage)).toEqual(['APPLIED']);
		expect(parseStageParam('nope')).toBeNull();
	});
});

describe('stageActions', () => {
	it('offers approve and deny on pending applications to whoever manages the request', () => {
		expect(stageActions({ stage: 'APPLIED', audience: 'practice', canManage: true, requestStatus: 'OPEN' })).toEqual(['APPROVE', 'DENY']);
		expect(stageActions({ stage: 'RECOMMENDED', audience: 'admin', canManage: true, requestStatus: 'OPEN' })).toEqual(['APPROVE', 'DENY']);
	});
	it('offers nothing without requisition rights or after a decision', () => {
		expect(stageActions({ stage: 'APPLIED', audience: 'practice', canManage: false, requestStatus: 'OPEN' })).toEqual([]);
		expect(stageActions({ stage: 'HIRED', audience: 'admin', canManage: true, requestStatus: 'OPEN' })).toEqual([]);
		expect(stageActions({ stage: 'DENIED', audience: 'admin', canManage: true, requestStatus: 'OPEN' })).toEqual([]);
		expect(stageActions({ stage: 'APPLIED', audience: 'admin', canManage: true, requestStatus: 'PAYMENT_REQUIRED' })).toEqual([]);
		expect(stageActions({ stage: 'APPLIED', audience: 'practice', canManage: true, requestStatus: 'CLOSED' })).toEqual([]);
	});
	it('lets only admins recommend an interested professional, and only while open', () => {
		expect(stageActions({ stage: 'INTERESTED', audience: 'admin', canManage: true, requestStatus: 'OPEN' })).toEqual(['RECOMMEND']);
		expect(stageActions({ stage: 'INTERESTED', audience: 'admin', canManage: true, requestStatus: 'PENDING' })).toEqual([]);
		expect(stageActions({ stage: 'INTERESTED', audience: 'practice', canManage: true, requestStatus: 'OPEN' })).toEqual([]);
	});
});

describe('interestedView', () => {
	it('never hands names to a practice, even if they were loaded', () => {
		expect(interestedView('practice', [{ name: 'Maria' }], 3)).toEqual({ count: 3, people: [] });
		expect(interestedView('admin', [{ name: 'Maria' }], 1)).toEqual({ count: 1, people: [{ name: 'Maria' }] });
		expect(interestedView('admin', null, 0)).toEqual({ count: 0, people: [] });
	});
});

import { mergeCandidateActivity, splitCandidateActivity } from './candidatePermanent';

describe('candidate permanent activity', () => {
	const req = (requisitionId: number, requestStatus = 'OPEN') => ({
		requisitionId,
		title: null,
		requestStatus,
		disciplineName: 'Dental Hygienist',
		companyName: 'Bright Smiles',
		locationName: 'Tampa'
	});
	it('shows one item per request, with the application winning over the save', () => {
		const items = mergeCandidateActivity(
			[{ ...req(1), applicationId: 'a1', status: 'PENDING', source: 'ADMIN_RECOMMENDED', createdAt: '2026-11-05T00:00:00Z' }],
			[
				{ ...req(1), savedAt: '2026-11-01T00:00:00Z' },
				{ ...req(2), savedAt: '2026-11-08T00:00:00Z' }
			]
		);
		expect(items.map((i) => [i.requisitionId, i.stage])).toEqual([
			[2, 'INTERESTED'],
			[1, 'RECOMMENDED']
		]);
		expect(items[1].savedAt).toBe('2026-11-01T00:00:00Z');
	});
	it('splits what they are still in the running for from outcomes', () => {
		const items = mergeCandidateActivity(
			[
				{ ...req(1), applicationId: 'a1', status: 'APPROVED', source: 'CANDIDATE', createdAt: '2026-11-05T00:00:00Z' },
				{ ...req(3, 'CLOSED'), applicationId: 'a3', status: 'PENDING', source: 'CANDIDATE', createdAt: '2026-11-04T00:00:00Z' }
			],
			[{ ...req(2), savedAt: '2026-11-08T00:00:00Z' }]
		);
		const { active, rest } = splitCandidateActivity(items);
		expect(active.map((i) => i.requisitionId)).toEqual([2]);
		expect(rest.map((i) => i.requisitionId)).toEqual([1, 3]);
	});
});
