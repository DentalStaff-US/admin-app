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
	it('passes a bare date input straight through', () => {
		// What <input type="date"> submits, and exactly what the `date` column stores.
		expect(toCredentialExpiryDate('2027-04-30')).toBe('2027-04-30');
	});

	it('round-trips through the read helper unchanged', () => {
		const stored = toCredentialExpiryDate('2027-04-30');
		expect(credentialExpiryToISODate(stored)).toBe('2027-04-30');
	});

	it('reduces a full ISO datetime to its UTC calendar date', () => {
		// Read in UTC, matching how pre-0060 values were written, so converting the
		// column could not shift anyone's expiry by a day.
		expect(toCredentialExpiryDate('2027-04-30T00:00:00.000Z')).toBe('2027-04-30');
		expect(toCredentialExpiryDate(new Date('2027-04-30T00:00:00.000Z'))).toBe('2027-04-30');
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
