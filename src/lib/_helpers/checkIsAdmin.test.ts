import { describe, it, expect } from 'vitest';
import { checkIsAdmin } from './checkIsAdmin';

describe('checkIsAdmin', () => {
	it('returns true for SUPERADMIN and ADMIN', () => {
		expect(checkIsAdmin('SUPERADMIN')).toBe(true);
		expect(checkIsAdmin('ADMIN')).toBe(true);
	});

	it('returns false for any other role or missing role', () => {
		expect(checkIsAdmin('CLIENT')).toBe(false);
		expect(checkIsAdmin('CLIENT_STAFF')).toBe(false);
		expect(checkIsAdmin('CANDIDATE')).toBe(false);
		expect(checkIsAdmin('')).toBe(false);
		expect(checkIsAdmin(undefined)).toBe(false);
	});
});
