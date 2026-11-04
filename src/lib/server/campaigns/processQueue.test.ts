import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/database/drizzle', () => ({ default: {} }));
vi.mock('$lib/server/email/emailService', () => ({ EmailService: class {} }));
vi.mock('$lib/server/sms/smsService', () => ({ sms: {} }));
vi.mock('$lib/server/logger', () => ({ logger: {} }));
vi.mock('./unsubscribe', () => ({ unsubscribeUrl: (id: string) => `https://example.com/u/${id}` }));

import { emailFooter } from './processQueue';

describe('emailFooter', () => {
	it('offers an unsubscribe link on admin-composed campaigns', () => {
		const footer = emailFooter({ filters: { audience: 'CLIENT' } }, 'user-1');
		expect(footer.html).toContain('https://example.com/u/user-1');
		expect(footer.text).toContain('https://example.com/u/user-1');
	});

	it('omits it from automated campaigns, which ignore the opt-out', () => {
		expect(emailFooter({ filters: { automated: true, autoKey: 'x' } }, 'user-1')).toEqual({
			html: '',
			text: ''
		});
	});
});
