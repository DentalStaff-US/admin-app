import { describe, it, expect } from 'vitest';
import {
	checkCandidateQualified,
	type CandidateDisciplineWithLevel,
	type RequisitionForQualification
} from './qualifyCandidate';

const TODAY = '2026-04-30';
const RDH = 'disc-rdh';
const DA = 'disc-da';

function discipline(
	over: Partial<CandidateDisciplineWithLevel> = {}
): CandidateDisciplineWithLevel {
	return {
		disciplineId: RDH,
		experienceLevelOrder: 3,
		preferredHourlyMin: 40,
		preferredHourlyMax: 60,
		requiresCertification: false,
		effectiveExpiry: null,
		...over
	};
}

function requisition(over: Partial<RequisitionForQualification> = {}): RequisitionForQualification {
	return { disciplineId: RDH, experienceLevelOrder: null, hourlyRate: 50, ...over };
}

const opts = { today: TODAY };

describe('discipline gate', () => {
	it('rejects a discipline the candidate does not hold', () => {
		const r = checkCandidateQualified([discipline()], requisition({ disciplineId: DA }), opts);
		expect(r).toMatchObject({ qualified: false, reason: 'discipline' });
	});

	it('passes a plain matching discipline', () => {
		expect(checkCandidateQualified([discipline()], requisition(), opts)).toEqual({
			qualified: true
		});
	});
});

describe('certification gate', () => {
	it('ignores the expiry when the discipline requires no certification', () => {
		// Enforcement follows the requirement: an optional credential someone
		// volunteered must not cost them work when it lapses. This is also the
		// per-discipline kill switch.
		const d = discipline({ requiresCertification: false, effectiveExpiry: '2020-01-01' });
		expect(checkCandidateQualified([d], requisition(), opts)).toEqual({ qualified: true });
	});

	it('does NOT block when required but nothing is on file (MISSING)', () => {
		// Deploy-safety property — see certStatus.ts. If this ever starts failing,
		// flagging a discipline would hide shifts from every professional holding it.
		const d = discipline({ requiresCertification: true, effectiveExpiry: null });
		expect(checkCandidateQualified([d], requisition(), opts)).toEqual({ qualified: true });
	});

	it('does not block on the expiry date itself', () => {
		const d = discipline({ requiresCertification: true, effectiveExpiry: TODAY });
		expect(checkCandidateQualified([d], requisition(), opts)).toEqual({ qualified: true });
	});

	it('blocks the day after expiry with reason "certification"', () => {
		const d = discipline({ requiresCertification: true, effectiveExpiry: '2026-04-29' });
		const r = checkCandidateQualified([d], requisition(), opts);
		expect(r).toMatchObject({ qualified: false, reason: 'certification' });
		expect(r).toHaveProperty('message', expect.stringContaining('expired'));
	});

	it('reports certification ahead of experience AND rate when all three fail', () => {
		// Ordering assertion. A professional failing several checks should be told
		// the one they can actually act on.
		const d = discipline({
			requiresCertification: true,
			effectiveExpiry: '2026-04-29',
			experienceLevelOrder: 1,
			preferredHourlyMin: 80,
			preferredHourlyMax: 90
		});
		const r = checkCandidateQualified([d], requisition({ experienceLevelOrder: 5, hourlyRate: 50 }), opts);
		expect(r).toMatchObject({ qualified: false, reason: 'certification' });
	});

	it('only gates the discipline whose credential lapsed', () => {
		const rdh = discipline({
			disciplineId: RDH,
			requiresCertification: true,
			effectiveExpiry: '2026-04-29'
		});
		const da = discipline({ disciplineId: DA, requiresCertification: true, effectiveExpiry: '2027-01-01' });
		expect(checkCandidateQualified([rdh, da], requisition({ disciplineId: DA }), opts)).toEqual({
			qualified: true
		});
		expect(
			checkCandidateQualified([rdh, da], requisition({ disciplineId: RDH }), opts)
		).toMatchObject({ qualified: false, reason: 'certification' });
	});
});

describe('experience gate (regression — unchanged behaviour)', () => {
	it('passes when the requisition has no required level', () => {
		const d = discipline({ experienceLevelOrder: 0 });
		expect(
			checkCandidateQualified([d], requisition({ experienceLevelOrder: null }), opts)
		).toEqual({ qualified: true });
	});

	it('is reductive: candidate order must be >= required', () => {
		const d = discipline({ experienceLevelOrder: 2 });
		expect(
			checkCandidateQualified([d], requisition({ experienceLevelOrder: 3 }), opts)
		).toMatchObject({ qualified: false, reason: 'experience' });
		expect(checkCandidateQualified([d], requisition({ experienceLevelOrder: 2 }), opts)).toEqual({
			qualified: true
		});
	});

	it('treats a null candidate level as 0', () => {
		const d = discipline({ experienceLevelOrder: null });
		expect(
			checkCandidateQualified([d], requisition({ experienceLevelOrder: 1 }), opts)
		).toMatchObject({ qualified: false, reason: 'experience' });
	});
});

describe('enforceRate', () => {
	it('enforces the preferred range by default (temp semantics)', () => {
		const d = discipline({ preferredHourlyMin: 40, preferredHourlyMax: 45 });
		expect(checkCandidateQualified([d], requisition({ hourlyRate: 50 }), opts)).toMatchObject({
			qualified: false,
			reason: 'rate'
		});
	});

	it('rejects a null rate by default', () => {
		expect(
			checkCandidateQualified([discipline()], requisition({ hourlyRate: null }), opts)
		).toMatchObject({ qualified: false, reason: 'rate' });
	});

	it('skips rate entirely when enforceRate is false (permanent semantics)', () => {
		// Locks in that adopting this helper in the two permanent paths is
		// behaviour-preserving: they never gated on rate.
		const d = discipline({ preferredHourlyMin: 40, preferredHourlyMax: 45 });
		const permOpts = { ...opts, enforceRate: false };
		expect(checkCandidateQualified([d], requisition({ hourlyRate: 50 }), permOpts)).toEqual({
			qualified: true
		});
		expect(checkCandidateQualified([d], requisition({ hourlyRate: null }), permOpts)).toEqual({
			qualified: true
		});
	});

	it('still applies the certification gate when rate is skipped', () => {
		const d = discipline({ requiresCertification: true, effectiveExpiry: '2026-04-29' });
		expect(
			checkCandidateQualified([d], requisition({ hourlyRate: null }), { ...opts, enforceRate: false })
		).toMatchObject({ qualified: false, reason: 'certification' });
	});
});
