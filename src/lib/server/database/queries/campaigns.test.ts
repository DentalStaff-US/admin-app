import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/database/drizzle', () => ({ default: {} }));

import { classifySegment } from './campaigns';

function row(overrides: Record<string, unknown>) {
	return {
		userId: 'u',
		profileId: 'p',
		firstName: 'Ann',
		lastName: 'Lee',
		email: 'ann@example.com',
		phone: '+15555550100',
		receiveEmail: true,
		receiveSms: true,
		...overrides
	} as Parameters<typeof classifySegment>[0][number];
}

describe('classifySegment', () => {
	const rows = [
		row({ userId: 'eligible' }),
		row({ userId: 'email-out', receiveEmail: false }),
		row({ userId: 'sms-out', receiveSms: false }),
		row({ userId: 'no-email', email: null }),
		// Opted out takes priority over missing contact details.
		row({ userId: 'out-and-no-email', receiveEmail: false, email: null })
	];
	const ids = (list: { userId: string }[]) => list.map((r) => r.userId);

	it('lists who is excluded from an email send and why', () => {
		const result = classifySegment(rows, 'EMAIL');
		expect(ids(result.recipients)).toEqual(['eligible', 'sms-out']);
		expect(ids(result.optedOutRecipients)).toEqual(['email-out', 'out-and-no-email']);
		expect(ids(result.noContactRecipients)).toEqual(['no-email']);
		expect(result).toMatchObject({ total: 5, eligible: 2, optedOut: 2, noContact: 1 });
	});

	it('uses the SMS opt-out for an SMS send', () => {
		const result = classifySegment(rows, 'SMS');
		expect(ids(result.optedOutRecipients)).toEqual(['sms-out']);
		expect(ids(result.recipients)).toContain('email-out');
	});

	it('never queues an excluded person', () => {
		const result = classifySegment(rows, 'EMAIL');
		const queued = new Set(ids(result.recipients));
		for (const r of [...result.optedOutRecipients, ...result.noContactRecipients]) {
			expect(queued.has(r.userId)).toBe(false);
		}
	});
});
