import { describe, expect, it } from 'vitest';
import { credentialProblems, disciplineCredentials, documentCredential } from './credentials';

const today = '2026-11-10';

describe('disciplineCredentials', () => {
	it('shows nothing when neither track applies', () => {
		expect(disciplineCredentials({ discipline: { requiresLicense: false }, experience: { requiresCert: false } }, today)).toEqual([]);
	});

	it('tones a missing license negative and a valid one positive', () => {
		const [missing] = disciplineCredentials({ discipline: { requiresLicense: true } }, today);
		expect(missing).toMatchObject({ track: 'LICENSE', tone: 'negative' });
		expect(missing.label).toMatch(/No license\/registration on file/);

		const [valid] = disciplineCredentials(
			{ discipline: { requiresLicense: true }, effectiveLicenseExpiry: '2028-01-31' },
			today
		);
		expect(valid.tone).toBe('positive');
	});

	it('warns when a certification expires within 60 days', () => {
		const chips = disciplineCredentials(
			{ discipline: { requiresLicense: false }, experience: { requiresCert: true }, effectiveCertExpiry: '2026-12-01' },
			today
		);
		expect(chips).toHaveLength(1);
		expect(chips[0]).toMatchObject({ track: 'CERTIFICATION', tone: 'warning' });
		expect(credentialProblems(chips)).toHaveLength(1);
	});
});

describe('documentCredential', () => {
	const disciplines = [{ discipline: { id: 'd1', requiresLicense: true } }];

	it('ignores a document without an expiry', () => {
		expect(documentCredential({ expiryDate: null, disciplineId: 'd1' }, disciplines, today)).toBeNull();
	});

	it('does not alarm on an unlinked document', () => {
		expect(documentCredential({ expiryDate: '2020-01-01', disciplineId: null }, disciplines, today)).toBeNull();
	});

	it('flags an expired linked license', () => {
		expect(documentCredential({ expiryDate: '2026-01-01', disciplineId: 'd1' }, disciplines, today)?.tone).toBe('negative');
	});
});
