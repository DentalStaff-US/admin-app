import { describe, it, expect } from 'vitest';
import {
	CONTACT_REDACTED_LABEL,
	maskLocation,
	roundDistanceMiles,
	scrubContactDetails
} from './clientIdentity';

describe('roundDistanceMiles', () => {
	it('buckets to the nearest half mile', () => {
		expect(roundDistanceMiles(3.2)).toBe(3);
		expect(roundDistanceMiles(3.26)).toBe(3.5);
		expect(roundDistanceMiles(0.1)).toBe(0);
	});
	it('passes null/undefined/NaN through as null', () => {
		expect(roundDistanceMiles(null)).toBeNull();
		expect(roundDistanceMiles(undefined)).toBeNull();
		expect(roundDistanceMiles(NaN)).toBeNull();
	});
});

describe('scrubContactDetails', () => {
	it('redacts emails, urls and US phone numbers', () => {
		const out = scrubContactDetails(
			'Email hr@smile.com, see https://smile.com/jobs or www.smile.com, call (813) 555-0134 or +1 813.555.0135.'
		)!;
		expect(out).not.toContain('hr@smile.com');
		expect(out).not.toContain('https://smile.com');
		expect(out).not.toContain('www.smile.com');
		expect(out).not.toContain('555-0134');
		expect(out).not.toContain('555.0135');
		expect(out).toContain(CONTACT_REDACTED_LABEL);
	});
	it('leaves ordinary prose readable', () => {
		expect(scrubContactDetails('Mon–Thu, 8am to 5pm. 3 chairs.')).toBe(
			'Mon–Thu, 8am to 5pm. 3 chairs.'
		);
	});
	it('returns null for null/undefined and passes an empty string through', () => {
		expect(scrubContactDetails(null)).toBeNull();
		expect(scrubContactDetails(undefined)).toBeNull();
		expect(scrubContactDetails('')).toBe('');
	});
});

describe('maskLocation', () => {
	const location = {
		id: 'loc-1',
		city: 'Tampa',
		state: 'FL',
		lat: '27.9506',
		lon: '-82.4572',
		distanceMiles: 4.3,
		// Extra fields a caller might pass through — must not appear in the result.
		name: 'Smith Family Dental',
		streetOne: '742 Evergreen Terrace'
	};

	it('nulls every identifying field and keeps city/state', () => {
		const masked = maskLocation(location, 'loc-1');
		expect(masked).toMatchObject({
			id: null,
			name: null,
			completeAddress: null,
			streetOne: null,
			streetTwo: null,
			zip: null,
			zipcode: null,
			companyPhone: null,
			email: null,
			website: null,
			city: 'Tampa',
			state: 'FL',
			distanceMiles: 4.5,
			approximate: true,
			locked: true
		});
		expect(JSON.stringify(masked)).not.toContain('Evergreen');
	});

	it('fuzzes coordinates deterministically and away from the true point', () => {
		const a = maskLocation(location, 'loc-1');
		const b = maskLocation(location, 'loc-1');
		expect(a.lat).toBe(b.lat);
		expect(a.lon).toBe(b.lon);
		expect(a.lat).not.toBe('27.9506');
		const dLat = Math.abs(parseFloat(a.lat!) - 27.9506);
		const dLon = Math.abs(parseFloat(a.lon!) + 82.4572);
		// 0.25–0.5 mi offset ≈ 0.0036–0.0072° — never zero, never more than ~0.01°.
		expect(dLat + dLon).toBeGreaterThan(0);
		expect(Math.max(dLat, dLon)).toBeLessThan(0.01);
	});

	it('handles a null location', () => {
		const masked = maskLocation(null, 'seed');
		expect(masked.city).toBeNull();
		expect(masked.lat).toBeNull();
		expect(masked.lon).toBeNull();
	});
});
