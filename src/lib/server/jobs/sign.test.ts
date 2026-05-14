import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { signJobRequest, verifyJobRequest } from './sign';

const secret = 'test-secret-1234567890abcdef';

function headers(record: Record<string, string>): Headers {
	const h = new Headers();
	for (const [k, v] of Object.entries(record)) h.set(k, v);
	return h;
}

describe('signJobRequest / verifyJobRequest', () => {
	it('verifies a freshly signed request', () => {
		const signed = signJobRequest('processInvoiceReminders', secret);
		const result = verifyJobRequest(headers(signed), 'processInvoiceReminders', secret);
		expect(result).toEqual({ ok: true });
	});

	it('rejects a request with the wrong job name', () => {
		const signed = signJobRequest('processInvoiceReminders', secret);
		const result = verifyJobRequest(headers(signed), 'processTimesheetCreation', secret);
		expect(result).toEqual({ ok: false, reason: 'job name mismatch' });
	});

	it('rejects a request signed with a different secret', () => {
		const signed = signJobRequest('processInvoiceReminders', secret);
		const result = verifyJobRequest(headers(signed), 'processInvoiceReminders', 'other-secret');
		expect(result).toEqual({ ok: false, reason: 'signature mismatch' });
	});

	it('rejects a tampered signature', () => {
		const signed = signJobRequest('processInvoiceReminders', secret);
		const result = verifyJobRequest(
			headers({ ...signed, 'x-signature': '00'.repeat(32) }),
			'processInvoiceReminders',
			secret
		);
		expect(result).toEqual({ ok: false, reason: 'signature mismatch' });
	});

	it('rejects an expired timestamp', () => {
		const oldTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString();
		const expectedSignature = crypto
			.createHmac('sha256', secret)
			.update(`processInvoiceReminders.${oldTimestamp}`)
			.digest('hex');
		const result = verifyJobRequest(
			headers({
				'x-job-name': 'processInvoiceReminders',
				'x-timestamp': oldTimestamp,
				'x-signature': expectedSignature
			}),
			'processInvoiceReminders',
			secret
		);
		expect(result).toEqual({ ok: false, reason: 'expired' });
	});

	it('rejects a request with missing headers', () => {
		const result = verifyJobRequest(headers({}), 'processInvoiceReminders', secret);
		expect(result).toEqual({ ok: false, reason: 'missing signature headers' });
	});
});
