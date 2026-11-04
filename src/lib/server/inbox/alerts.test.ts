import { describe, expect, it } from 'vitest';
import { inboxAlertPlan } from './alerts';

describe('inboxAlertPlan', () => {
	it('emails and texts on the first message of a conversation', () => {
		expect(inboxAlertPlan({ unreadBefore: 0, isFirstMessage: true })).toEqual({ email: true, sms: true });
	});
	it('emails, without a text, on a later message once they have caught up', () => {
		expect(inboxAlertPlan({ unreadBefore: 0, isFirstMessage: false })).toEqual({ email: true, sms: false });
	});
	it('stays quiet while earlier messages are still unread', () => {
		expect(inboxAlertPlan({ unreadBefore: 2, isFirstMessage: false })).toEqual({ email: false, sms: false });
	});
});
