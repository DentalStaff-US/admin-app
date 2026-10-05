import { describe, it, expect } from 'vitest';
import {
	credentialState,
	credentialGate,
	credentialBlockedMessage,
	graceDaysRemaining,
	daysUntil,
	todayInET,
	LICENSE_GRACE_DAYS,
	CERT_EXPIRING_SOON_DAYS,
	type DisciplineCredentials
} from './credentialStatus';

const TODAY = '2026-04-30';

function dateIn(days: number): string {
	const d = new Date(`${TODAY}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

/** Neither track required — the state of every discipline before anyone flags it. */
const none: DisciplineCredentials = {
	license: { required: false, expiresOn: null, graceStartedOn: null },
	certification: { required: false, expiresOn: null }
};
const withLicense = (o: Partial<DisciplineCredentials['license']>): DisciplineCredentials => ({
	...none,
	license: { required: true, expiresOn: null, graceStartedOn: null, ...o }
});
const withCert = (o: Partial<DisciplineCredentials['certification']>): DisciplineCredentials => ({
	...none,
	certification: { required: true, expiresOn: null, ...o }
});

describe('todayInET', () => {
	it('resolves the business-timezone date, not the UTC date', () => {
		// 03:00 UTC on May 1 is 23:00 ET on Apr 30. Using the UTC date would advance
		// "today" and lock out someone whose credential is still valid.
		expect(todayInET(new Date('2026-05-01T03:00:00Z'))).toBe('2026-04-30');
	});
});

describe('credentialState — one track', () => {
	it('is NOT_REQUIRED when the track does not apply, whatever the date', () => {
		expect(credentialState({ required: false, expiresOn: null }, TODAY)).toBe('NOT_REQUIRED');
		// An optional credential someone volunteered must not cost them work.
		expect(credentialState({ required: false, expiresOn: '2020-01-01' }, TODAY)).toBe(
			'NOT_REQUIRED'
		);
	});

	it('is MISSING — not blocking — when required with nothing on file and no clock', () => {
		expect(credentialState({ required: true, expiresOn: null }, TODAY)).toBe('MISSING');
	});

	it('is valid THROUGH the expiry date, EXPIRED the day after', () => {
		expect(credentialState({ required: true, expiresOn: TODAY }, TODAY)).toBe('EXPIRING');
		expect(credentialState({ required: true, expiresOn: dateIn(-1) }, TODAY)).toBe('EXPIRED');
	});

	it('is EXPIRING inside the warning window and VALID outside it', () => {
		expect(credentialState({ required: true, expiresOn: dateIn(CERT_EXPIRING_SOON_DAYS) }, TODAY)).toBe('EXPIRING');
		expect(credentialState({ required: true, expiresOn: dateIn(CERT_EXPIRING_SOON_DAYS + 1) }, TODAY)).toBe('VALID');
	});
});

describe('the 30-day license grace clock', () => {
	it('does not block a missing license before anyone has been notified', () => {
		// The property that makes a hard block defensible: no notification, no clock.
		const c = withLicense({ graceStartedOn: null });
		expect(credentialState(c.license, TODAY)).toBe('MISSING');
		expect(credentialGate(c, TODAY).blocked).toBe(false);
	});

	it('runs while the grace period lasts, then blocks', () => {
		const justStarted = withLicense({ graceStartedOn: TODAY });
		expect(credentialState(justStarted.license, TODAY)).toBe('MISSING_GRACE');
		expect(credentialGate(justStarted, TODAY).blocked).toBe(false);

		const dayBefore = withLicense({ graceStartedOn: dateIn(-(LICENSE_GRACE_DAYS - 1)) });
		expect(credentialState(dayBefore.license, TODAY)).toBe('MISSING_GRACE');
		expect(credentialGate(dayBefore, TODAY).blocked).toBe(false);

		const expired = withLicense({ graceStartedOn: dateIn(-LICENSE_GRACE_DAYS) });
		expect(credentialState(expired.license, TODAY)).toBe('EXPIRED');
		expect(credentialGate(expired, TODAY).blocked).toBe(true);
	});

	it('reports the days remaining, floored at zero', () => {
		expect(graceDaysRemaining(withLicense({ graceStartedOn: TODAY }).license, TODAY)).toBe(30);
		expect(graceDaysRemaining(withLicense({ graceStartedOn: dateIn(-23) }).license, TODAY)).toBe(7);
		expect(graceDaysRemaining(withLicense({ graceStartedOn: dateIn(-99) }).license, TODAY)).toBe(0);
	});

	it('ignores the clock entirely once a license is on file', () => {
		// A stale grace row must never block someone who has since complied.
		const c = withLicense({ expiresOn: dateIn(365), graceStartedOn: dateIn(-99) });
		expect(credentialState(c.license, TODAY)).toBe('VALID');
		expect(credentialGate(c, TODAY).blocked).toBe(false);
	});

	it('gives a lapsed license no grace at all', () => {
		// Grace covers never-supplied, not expired. A grace window on a lapsed licence
		// is a window in which someone is placed into a practice holding one.
		const c = withLicense({ expiresOn: dateIn(-1), graceStartedOn: null });
		expect(credentialGate(c, TODAY).blocked).toBe(true);
	});

	it('never applies a clock to the certification track', () => {
		// A declared certification with no date can only come from an admin slip, and
		// is chased through the digest rather than by taking work away.
		const c = withCert({ expiresOn: null });
		expect(credentialState(c.certification, TODAY)).toBe('MISSING');
		expect(credentialGate(c, TODAY).blocked).toBe(false);
	});
});

describe('credentialGate — composing both tracks', () => {
	it('is not blocked when neither track applies', () => {
		expect(credentialGate(none, TODAY).blocked).toBe(false);
	});

	it('blocks on either track independently', () => {
		expect(credentialGate(withLicense({ expiresOn: dateIn(-1) }), TODAY).blockedBy).toEqual([
			{ track: 'LICENSE', expiresOn: dateIn(-1) }
		]);
		expect(credentialGate(withCert({ expiresOn: dateIn(-1) }), TODAY).blockedBy).toEqual([
			{ track: 'CERTIFICATION', expiresOn: dateIn(-1) }
		]);
	});

	it('reports BOTH when both have lapsed, license first', () => {
		// One action for them, two for us — and the order must be deterministic so
		// blockedBy[0] can drive the reason code.
		const both: DisciplineCredentials = {
			license: { required: true, expiresOn: dateIn(-5), graceStartedOn: null },
			certification: { required: true, expiresOn: dateIn(-2) }
		};
		const gate = credentialGate(both, TODAY);
		expect(gate.blocked).toBe(true);
		expect(gate.blockedBy.map((b) => b.track)).toEqual(['LICENSE', 'CERTIFICATION']);
	});

	it('leaves a valid track alone when the other lapses', () => {
		const mixed: DisciplineCredentials = {
			license: { required: true, expiresOn: dateIn(365), graceStartedOn: null },
			certification: { required: true, expiresOn: dateIn(-1) }
		};
		const gate = credentialGate(mixed, TODAY);
		expect(gate.states.LICENSE).toBe('VALID');
		expect(gate.states.CERTIFICATION).toBe('EXPIRED');
		expect(gate.blockedBy).toHaveLength(1);
	});
});

describe('credentialBlockedMessage', () => {
	it('names the credential that actually lapsed', () => {
		const licenseMsg = credentialBlockedMessage([{ track: 'LICENSE', expiresOn: '2026-01-01' }]);
		expect(licenseMsg).toMatch(/license/i);
		// The old single message told people to upload a certificate when their
		// LICENSE had expired, sending them to renew the wrong thing.
		expect(licenseMsg).not.toMatch(/certification/i);

		const certMsg = credentialBlockedMessage([{ track: 'CERTIFICATION', expiresOn: '2026-01-01' }]);
		expect(certMsg).toMatch(/certification/i);
		expect(certMsg).not.toMatch(/\blicense\b/i);
	});

	it('names both when both lapsed', () => {
		const msg = credentialBlockedMessage([
			{ track: 'LICENSE', expiresOn: '2026-01-01' },
			{ track: 'CERTIFICATION', expiresOn: '2026-02-01' }
		]);
		expect(msg).toMatch(/license/i);
		expect(msg).toMatch(/certification/i);
	});
});

describe('daysUntil', () => {
	it('counts whole calendar days across a DST boundary', () => {
		// US DST starts 2026-03-08; an hour-based diff floors to 0 and fires the
		// "expires today" stage a day early.
		expect(daysUntil('2026-03-09', '2026-03-08')).toBe(1);
	});
});
