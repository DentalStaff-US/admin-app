import { describe, expect, it } from 'vitest';
import { candidateName, documentCredential, filterDocuments, isExpiringSoon, isGatingExpired, type DocumentRow } from './documents';

const today = '2026-11-10';
const base: DocumentRow = {
	id: '1',
	createdAt: '2026-01-01',
	updatedAt: '2026-01-01',
	uploadUrl: 'https://example.test/f.pdf',
	expiryDate: null,
	type: 'LICENSE',
	filename: 'license.pdf',
	candidateId: 'c1',
	candidateFirstName: 'Maria',
	candidateLastName: 'Lopez',
	disciplineId: 'd1',
	disciplineName: 'Dental Hygienist',
	disciplineAbbreviation: 'RDH',
	requiresLicense: true
};

const expired = { ...base, id: 'e', expiryDate: '2026-10-01' };
const expiring = { ...base, id: 's', expiryDate: '2026-11-30' };
const valid = { ...base, id: 'v', expiryDate: '2028-01-01' };
const notRequired = { ...base, id: 'n', expiryDate: '2026-10-01', requiresLicense: false };
const unlinked = { ...base, id: 'u', expiryDate: '2026-10-01', disciplineId: null };
const resume = { ...base, id: 'r', type: 'RESUME' as const };

describe('documentCredential', () => {
	it('is null without a date or a linked discipline', () => {
		expect(documentCredential(base, today)).toBeNull();
		expect(documentCredential(unlinked, today)).toBeNull();
	});
	it('reports the state and the admin label', () => {
		expect(documentCredential(expired, today)?.state).toBe('EXPIRED');
		expect(documentCredential(expired, today)?.label).toMatch(/jobs hidden/);
		expect(documentCredential(expiring, today)?.state).toBe('EXPIRING');
		expect(documentCredential(valid, today)?.state).toBe('VALID');
	});
	it("doesn't gate on a discipline that needs no license", () => {
		expect(documentCredential(notRequired, today)).toBeNull();
	});
});

describe('queues', () => {
	it('only counts gating rows', () => {
		expect(isGatingExpired(expired, today)).toBe(true);
		expect(isGatingExpired(notRequired, today)).toBe(false);
		expect(isGatingExpired(unlinked, today)).toBe(false);
		expect(isExpiringSoon(expiring, today)).toBe(true);
		expect(isExpiringSoon(valid, today)).toBe(false);
	});

	it('filters by type, then credential', () => {
		const all = [expired, expiring, valid, notRequired, unlinked, resume];
		expect(filterDocuments(all, 'RESUME', 'ALL', today).map((d) => d.id)).toEqual(['r']);
		expect(filterDocuments(all, 'ALL', 'EXPIRED', today).map((d) => d.id)).toEqual(['e']);
		expect(filterDocuments(all, 'LICENSE', 'EXPIRING', today).map((d) => d.id)).toEqual(['s']);
		expect(filterDocuments(all, 'ALL', 'ALL', today)).toHaveLength(6);
	});
});

it('names the candidate last, first', () => {
	expect(candidateName(base)).toBe('Lopez, Maria');
	expect(candidateName({ candidateFirstName: null, candidateLastName: 'Lopez' })).toBe('Unknown');
});
