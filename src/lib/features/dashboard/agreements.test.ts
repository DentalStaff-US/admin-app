import { describe, expect, it } from 'vitest';
import { agreementStage, agreementStatus, type AgreementPractice } from './agreements';

const base: AgreementPractice = {
	clientId: 'c1',
	name: 'Alpha Dental',
	clientCreatedAt: '2026-10-01T00:00:00Z',
	latest: null,
	everCompleted: false,
	hasUploadedAgreement: false
};
const req = (status: string, extra = {}) => ({ status, sentAt: '2026-10-05T00:00:00Z', subjectSignedAt: null, createdAt: '2026-10-04T00:00:00Z', ...extra });

describe('agreementStage', () => {
	it('drops completed agreements, signed or uploaded', () => {
		expect(agreementStage({ ...base, everCompleted: true, latest: req('COMPLETED') })).toBeNull();
		expect(agreementStage({ ...base, hasUploadedAgreement: true })).toBeNull();
	});
	it('reads never-sent and closed-without-signing as not sent', () => {
		expect(agreementStage(base)?.stage).toBe('NOT_SENT');
		expect(agreementStage({ ...base, latest: req('EXPIRED') })?.stage).toBe('NOT_SENT');
		expect(agreementStage({ ...base, latest: req('FAILED') })?.stage).toBe('NOT_SENT');
	});
	it('separates waiting on the practice from waiting on DTSS', () => {
		expect(agreementStage({ ...base, latest: req('OPENED') })?.stage).toBe('AWAITING_SIGNATURE');
		const counter = agreementStage({ ...base, latest: req('AWAITING_COUNTERSIGN', { subjectSignedAt: '2026-10-09T00:00:00Z' }) });
		expect(counter).toEqual({ stage: 'AWAITING_COUNTERSIGN', since: new Date('2026-10-09T00:00:00Z') });
	});
});

describe('agreementStatus', () => {
	it('counts each stage and orders by stage then longest wait', () => {
		const s = agreementStatus([
			{ ...base, clientId: 'a', latest: req('SENT', { sentAt: '2026-10-08T00:00:00Z' }) },
			{ ...base, clientId: 'b', latest: req('SENT', { sentAt: '2026-10-02T00:00:00Z' }) },
			{ ...base, clientId: 'c' },
			{ ...base, clientId: 'd', everCompleted: true }
		]);
		expect(s.counts).toEqual({ NOT_SENT: 1, AWAITING_SIGNATURE: 2, AWAITING_COUNTERSIGN: 0 });
		expect(s.rows.map((r) => r.clientId)).toEqual(['c', 'b', 'a']);
		expect(s.rows[0].href).toBe('/clients/c?tab=documents');
	});
});
