import { describe, expect, it } from 'vitest';
import {
	displayName,
	formatDate,
	money,
	payoutReadiness,
	profileHref,
	referredTypeLabel,
	roleLabel,
	shortAddress,
	sortableName
} from './people';
import { buildCompleteAddress, parseImportRow, validateUser } from './userImport';

describe('people helpers', () => {
	it('names', () => {
		expect(sortableName({ firstName: 'Dana', lastName: 'Whit' })).toBe('Whit, Dana');
		expect(sortableName({ firstName: null, lastName: 'Whit' })).toBe('Whit');
		expect(sortableName({ firstName: null, lastName: null })).toBe('(no name)');
		expect(displayName({ firstName: null, lastName: null, email: 'a@b.co' })).toBe('a@b.co');
		expect(displayName({ firstName: 'Dana', lastName: 'Whit' })).toBe('Dana Whit');
	});

	it('links to the profile id for the role', () => {
		const base = { candidateProfileId: 'cp1', clientProfileId: 'cl1' };
		expect(profileHref({ ...base, role: 'CANDIDATE' })).toBe('/professionals/cp1');
		expect(profileHref({ ...base, role: 'CLIENT_STAFF' })).toBe('/clients/cl1');
		expect(profileHref({ ...base, role: 'SUPERADMIN' })).toBeNull();
		expect(profileHref({ role: 'CANDIDATE', candidateProfileId: null, clientProfileId: null })).toBeNull();
	});

	it('formats', () => {
		expect(shortAddress({ city: 'Tampa', state: 'FL' })).toBe('Tampa, FL');
		expect(shortAddress({ city: null, state: 'FL' })).toBe('FL');
		expect(formatDate(new Date(2026, 0, 5))).toBe('01/05/2026');
		expect(money('1234.5')).toBe('$1,234.50');
		expect(money(-14.5)).toBe('-$14.50');
		expect(money(null)).toBe('$0.00');
		expect(roleLabel('CANDIDATE')).toBe('Professional');
		expect(roleLabel('WHATEVER')).toBe('WHATEVER');
		expect(referredTypeLabel('EXTERNAL_PARTNER')).toBe('Partner');
		expect(referredTypeLabel('CLIENT')).toBe('Practice');
	});

	it('payout readiness', () => {
		expect(payoutReadiness({ connectPayoutsEnabled: true }).label).toBe('Ready');
		expect(payoutReadiness({ stripeConnectAccountId: 'acct_1' }).label).toBe('Onboarding');
		expect(payoutReadiness({}).label).toBe('Not set up');
	});
});

describe('user import parsing', () => {
	it('assembles an address from its parts', () => {
		expect(
			buildCompleteAddress({ Address: '1 Main St', 'Address 2': 'Ste 4', City: 'Tampa', State: 'FL', Zip: '33601' })
				.fullAddress
		).toBe('1 Main St, Ste 4, Tampa, FL, 33601');
		expect(buildCompleteAddress({ state: 'FL' }).fullAddress).toBe('FL');
	});

	it('maps column aliases and lowercases email', () => {
		const user = parseImportRow(
			{ 'First Name': ' Dana ', last: 'Whit', 'E-mail': 'Dana@X.com', Specialty: 'Hygienist', City: 'Tampa' },
			'CANDIDATE'
		);
		expect(user).toMatchObject({ firstName: 'Dana', lastName: 'Whit', email: 'dana@x.com', discipline: 'Hygienist', city: 'Tampa' });
		expect(user.errors).toEqual([]);
	});

	it('validates per role', () => {
		const client = parseImportRow({ first: 'A', last: 'B', email: 'bad' }, 'CLIENT');
		expect(client.errors).toEqual(['Invalid email format', 'Company name is required']);
		expect(validateUser({ firstName: '', lastName: '', email: '', errors: [] }, 'SUPERADMIN')).toHaveLength(3);
	});
});
