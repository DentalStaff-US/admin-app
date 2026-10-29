import { describe, it, expect, vi } from 'vitest';

// planReminder is pure, but its module also holds the runner, which imports the
// db and the kinds registry. Stub both so importing it touches nothing real.
vi.mock('$lib/server/database/drizzle', () => ({ default: {} }));
vi.mock('./kinds', () => ({ getSignatureKind: vi.fn() }));

const { planReminder, daysSince } = await import('./reminders');

const SENT = new Date('2026-10-01T15:00:00Z');
const at = (days: number, hours = 0) => new Date(SENT.getTime() + (days * 24 + hours) * 3600_000);
const open = (over = {}) => ({
	status: 'SENT' as const,
	sentAt: SENT,
	subjectSignedAt: null,
	nudgesExhaustedAt: null,
	...over
});

describe('planReminder — subject series', () => {
	it('sends nothing on day 0 and 1', () => {
		expect(planReminder(open(), at(0))).toBeNull();
		expect(planReminder(open(), at(1, 23))).toBeNull();
	});

	it('first nudge on day 2, email only', () => {
		expect(planReminder(open(), at(2))).toMatchObject({ type: 'SUBJECT', stage: 'D2', sms: false });
	});

	it('SMS on days 5, 15 and 29', () => {
		expect(planReminder(open(), at(5))).toMatchObject({ stage: 'D5', sms: true });
		expect(planReminder(open(), at(10))).toMatchObject({ stage: 'D10', sms: false });
		expect(planReminder(open(), at(15))).toMatchObject({ stage: 'D15', sms: true });
		expect(planReminder(open(), at(29))).toMatchObject({ stage: 'D29', sms: true, finalNotice: true });
	});

	it('is banded: a missed run sends the latest due stage, not every missed one', () => {
		expect(planReminder(open(), at(13))).toMatchObject({ stage: 'D10' });
	});

	it('applies to OPENED requests too', () => {
		expect(planReminder(open({ status: 'OPENED' }), at(5))).toMatchObject({ stage: 'D5' });
	});

	it('stops after 30 days and hands over to admins, once', () => {
		expect(planReminder(open(), at(30))).toEqual({ type: 'EXHAUSTED', stage: 'EXHAUSTED' });
		expect(planReminder(open({ nudgesExhaustedAt: at(30) }), at(31))).toBeNull();
	});

	it('does not nudge closed or failed requests', () => {
		for (const status of ['COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED', 'FAILED', 'PENDING']) {
			expect(planReminder(open({ status }), at(5))).toBeNull();
		}
	});
});

describe('planReminder — countersigner', () => {
	const signed = (over = {}) =>
		open({ status: 'AWAITING_COUNTERSIGN', subjectSignedAt: at(4), ...over });

	it('stops chasing the client once they have signed', () => {
		const p = planReminder(signed(), at(5));
		expect(p).toBeNull();
	});

	it('reminds the countersigner 3 days after the client signs', () => {
		expect(planReminder(signed(), at(6, 23))).toBeNull();
		expect(planReminder(signed(), at(7))).toEqual({ type: 'COUNTERSIGN', stage: 'COUNTERSIGN_D3' });
	});
});

describe('daysSince', () => {
	it('counts whole days', () => {
		expect(daysSince(SENT, at(2, 5))).toBe(2);
	});
});
