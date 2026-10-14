import { describe, expect, it } from 'vitest';
import {
	annotateAndSortMatches,
	recommendationBlockReason,
	type RecommendationCheck
} from './matchRules';

const pro = (
	candidateId: string,
	workPreference: string | null,
	experienceLevelOrder: number | null,
	distance: string
) => ({ candidateId, workPreference, experienceLevelOrder, distance });

describe('annotateAndSortMatches', () => {
	it('keeps PERMANENT, BOTH and unanswered; drops TEMP-only', () => {
		const out = annotateAndSortMatches(
			[
				pro('a', 'PERMANENT', 2, '1'),
				pro('b', 'BOTH', 2, '2'),
				pro('c', null, 2, '3'),
				pro('d', 'TEMP', 2, '0.5')
			],
			null,
			new Map()
		);
		expect(out.map((m) => m.candidateId)).toEqual(['a', 'b', 'c']);
	});

	it('flags experience and sorts qualified first, then nearest', () => {
		const out = annotateAndSortMatches(
			[
				pro('far-ok', 'BOTH', 3, '20'),
				pro('near-low', 'BOTH', 1, '1'),
				pro('near-ok', 'BOTH', 2, '5')
			],
			2,
			new Map()
		);
		expect(out.map((m) => [m.candidateId, m.meetsExperience])).toEqual([
			['near-ok', true],
			['far-ok', true],
			['near-low', false]
		]);
	});

	it('treats a req with no experience level as met by everyone', () => {
		const [m] = annotateAndSortMatches([pro('a', 'BOTH', null, '1')], null, new Map());
		expect(m.meetsExperience).toBe(true);
	});

	it('attaches an existing application', () => {
		const apps = new Map([['a', { id: 'app1', status: 'PENDING', source: 'CANDIDATE' }]]);
		const out = annotateAndSortMatches(
			[pro('a', 'BOTH', 1, '1'), pro('b', 'BOTH', 1, '2')],
			null,
			apps
		);
		expect(out[0].application?.id).toBe('app1');
		expect(out[1].application).toBeNull();
	});
});

describe('recommendationBlockReason', () => {
	const ok: RecommendationCheck = {
		consentConfirmed: true,
		requisition: { status: 'OPEN', permanentPosition: true },
		candidateStatus: 'ACTIVE',
		clientActive: true,
		blacklisted: false,
		hasExistingApplication: false
	};

	it('allows a valid recommendation', () => {
		expect(recommendationBlockReason(ok)).toBeNull();
	});

	it.each([
		['no consent', { consentConfirmed: false }, /agreed/],
		['missing req', { requisition: null }, /not found/],
		['temp req', { requisition: { status: 'OPEN', permanentPosition: false } }, /permanent/],
		[
			'closed req',
			{ requisition: { status: 'PAYMENT_REQUIRED', permanentPosition: true } },
			/no longer open/
		],
		['inactive pro', { candidateStatus: 'PENDING' }, /not active/],
		['inactive client', { clientActive: false }, /client/],
		['blacklisted', { blacklisted: true }, /blocked/],
		['duplicate', { hasExistingApplication: true }, /already has an application/]
	] as const)('blocks: %s', (_label, patch, re) => {
		expect(
			recommendationBlockReason({ ...ok, ...(patch as Partial<RecommendationCheck>) })
		).toMatch(re);
	});
});
