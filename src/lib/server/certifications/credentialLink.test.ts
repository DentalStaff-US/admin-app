import { describe, it, expect } from 'vitest';
import {
	isCredentialType,
	toCredentialExpiryDate,
	credentialExpiryToISODate
} from './credentialLink';

describe('isCredentialType', () => {
	it('accepts only the two credential types', () => {
		expect(isCredentialType('LICENSE')).toBe(true);
		expect(isCredentialType('CERTIFICATE')).toBe(true);
		// An agreement or a resume with an expiry must never gate placement.
		for (const t of ['AGREEMENT', 'OTHER', 'RESUME', '', null, undefined]) {
			expect(isCredentialType(t as string)).toBe(false);
		}
	});
});

describe('toCredentialExpiryDate', () => {
	it('stores a bare date input as midnight UTC', () => {
		// What <input type="date"> submits. Storing local midnight instead would read
		// back a day early once cast with AT TIME ZONE 'UTC'.
		expect(toCredentialExpiryDate('2027-04-30')?.toISOString()).toBe('2027-04-30T00:00:00.000Z');
	});

	it('round-trips through the read helper unchanged', () => {
		const stored = toCredentialExpiryDate('2027-04-30');
		expect(credentialExpiryToISODate(stored)).toBe('2027-04-30');
	});

	it('accepts a full ISO datetime', () => {
		expect(toCredentialExpiryDate('2027-04-30T00:00:00.000Z')?.toISOString()).toBe(
			'2027-04-30T00:00:00.000Z'
		);
	});

	it('returns null for empty and invalid input rather than an Invalid Date', () => {
		for (const v of ['', null, undefined, 'not-a-date']) {
			expect(toCredentialExpiryDate(v as string)).toBeNull();
		}
	});
});

describe('credentialExpiryToISODate', () => {
	it('handles both stored shapes and null', () => {
		expect(credentialExpiryToISODate(new Date('2027-04-30T00:00:00.000Z'))).toBe('2027-04-30');
		expect(credentialExpiryToISODate('2027-04-30')).toBe('2027-04-30');
		expect(credentialExpiryToISODate(null)).toBeNull();
	});
});
