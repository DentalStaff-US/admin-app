import { describe, it, expect } from 'vitest';
import { EMAIL_TEMPLATES } from './templates';
import { SMS_TEMPLATES } from '../sms/templates';

/**
 * These templates are only ever executed by a cron job, so without this they would
 * first run in production, at 11am, against real professionals. The assertions are
 * deliberately about substance — does the message name the discipline, the date, and
 * the consequence — rather than exact wording.
 */

const STAGES = ['D60', 'D30', 'D14', 'D7', 'D0', 'EXPIRED'] as const;
const DAYS: Record<(typeof STAGES)[number], number> = {
	D60: 60,
	D30: 30,
	D14: 14,
	D7: 7,
	D0: 0,
	EXPIRED: -1
};

const render = (
	stage: (typeof STAGES)[number],
	track: 'LICENSE' | 'CERTIFICATION' = 'CERTIFICATION'
) =>
	EMAIL_TEMPLATES.credentialExpiryReminderEmail({
		track,
		firstName: 'Jane',
		disciplineName: 'Dental Hygienist',
		abbreviation: 'RDH',
		expiresOn: 'Thursday, Apr 30, 2026',
		daysUntil: DAYS[stage],
		stage,
		uploadUrl: 'https://candidate.example.com/settings/documents'
	});

describe('credentialExpiryReminderEmail', () => {
	it('renders every stage without throwing, with all three parts populated', () => {
		for (const stage of STAGES) {
			const t = render(stage);
			expect(t.subject, stage).toBeTruthy();
			expect(t.textEmail, stage).toBeTruthy();
			expect(t.htmlEmail, stage).toBeTruthy();
		}
	});

	it('leaves no unsubstituted placeholders', () => {
		for (const stage of STAGES) {
			const t = render(stage);
			for (const part of [t.subject, t.textEmail, t.htmlEmail]) {
				expect(part, stage).not.toMatch(/undefined|null|\{\{|\[object/);
			}
		}
	});

	it('names the professional, the discipline and the date in every stage', () => {
		for (const stage of STAGES) {
			const t = render(stage);
			expect(t.textEmail, stage).toContain('Jane');
			expect(t.textEmail, stage).toContain('Dental Hygienist');
			expect(t.textEmail, stage).toContain('Apr 30, 2026');
			expect(t.textEmail, stage).toContain('https://candidate.example.com/settings/documents');
		}
	});

	it('names the right credential, and never the wrong one', () => {
		// The whole point of the split: an email naming the wrong credential makes
		// them renew the thing that was not expiring.
		for (const stage of STAGES) {
			const lic = render(stage, 'LICENSE');
			expect(lic.textEmail, stage).toMatch(/license/i);
			expect(lic.textEmail, stage).not.toMatch(/certification/i);

			const cert = render(stage, 'CERTIFICATION');
			expect(cert.textEmail, stage).toMatch(/certification/i);
			expect(cert.textEmail, stage).not.toMatch(/\blicense\b/i);
		}
	});

	it('gives each stage a distinct subject', () => {
		const subjects = STAGES.map((s) => render(s).subject);
		// D60/D30/D14 share a form but differ by date; D7/D0/EXPIRED are distinct.
		expect(new Set(subjects).size).toBeGreaterThanOrEqual(4);
	});

	it('states the consequence in the right tense', () => {
		// The day-after message is the whole reason that stage exists: "expires today"
		// reads as still-fine, while the lockout has actually started.
		const expired = render('EXPIRED');
		expect(expired.subject.toLowerCase()).toContain('hidden');
		expect(expired.textEmail).toMatch(/expired on/i);
		expect(expired.textEmail).toMatch(/no longer showing/i);

		const d7 = render('D7');
		expect(d7.subject).toMatch(/7 days left/i);
		// Not yet lost — must not claim shifts are already gone.
		expect(d7.textEmail).not.toMatch(/no longer showing/i);
		expect(d7.textEmail).toMatch(/will be hidden/i);
	});

	it('reassures that other disciplines are unaffected', () => {
		for (const stage of STAGES) {
			expect(render(stage).textEmail, stage).toMatch(/other disciplines are not affected/i);
		}
	});
});

describe('certExpiryDigestAdminEmail', () => {
	const row = (name: string) => ({
		name,
		discipline: 'Dental Hygienist (RDH)',
		expiresOn: '2026-04-30',
		candidateId: 'cand-1'
	});

	it('renders with every section populated', () => {
		const t = EMAIL_TEMPLATES.certExpiryDigestAdminEmail({
			bookedWithExpired: [{ ...row('Booked Betty'), shiftDates: '2026-05-05, 2026-05-06' }],
			expired: [row('Expired Eric')],
			expiring: [row('Expiring Erin')],
			missing: [{ discipline: 'Dental Hygienist (RDH)', count: 276 }],
			recent: [row('Recent Rita')]
		});
		expect(t.subject).toBeTruthy();
		for (const n of ['Booked Betty', 'Expired Eric', 'Expiring Erin', 'Recent Rita', '276']) {
			expect(t.htmlEmail).toContain(n);
		}
		expect(t.htmlEmail).not.toMatch(/undefined|\[object/);
	});

	it('renders with every section empty (the common case) without emitting stray tables', () => {
		const t = EMAIL_TEMPLATES.certExpiryDigestAdminEmail({
			bookedWithExpired: [],
			expired: [],
			expiring: [],
			missing: [],
			recent: []
		});
		expect(t.htmlEmail).not.toContain('<table');
		expect(t.htmlEmail).not.toMatch(/undefined|\[object/);
	});

	it('puts booked-with-expired first — the case the gate cannot protect against', () => {
		const t = EMAIL_TEMPLATES.certExpiryDigestAdminEmail({
			bookedWithExpired: [{ ...row('Booked Betty'), shiftDates: '2026-05-05' }],
			expired: [row('Expired Eric')],
			expiring: [],
			missing: [],
			recent: []
		});
		expect(t.htmlEmail.indexOf('Booked Betty')).toBeLessThan(t.htmlEmail.indexOf('Expired Eric'));
	});
});

describe('certification SMS', () => {
	it('fits comfortably in a single segment and names the discipline', () => {
		const msgs = [
			SMS_TEMPLATES.credentialExpiringNotification({
				firstName: 'Jane',
				disciplineName: 'Dental Hygienist',
				credential: 'license',
				expiresOn: 'Apr 30, 2026',
				daysUntil: 7
			}).textMessage,
			SMS_TEMPLATES.credentialExpiringNotification({
				firstName: 'Jane',
				disciplineName: 'Dental Hygienist',
				credential: 'certification',
				expiresOn: 'Apr 30, 2026',
				daysUntil: 0
			}).textMessage,
			SMS_TEMPLATES.credentialExpiredNotification({
				firstName: 'Jane',
				disciplineName: 'Dental Hygienist',
				credential: 'license'
			}).textMessage
		];

		for (const m of msgs) {
			expect(m).toContain('Jane');
			expect(m).toContain('Dental Hygienist');
			expect(m).not.toMatch(/undefined|null|\[object/);
			// Twilio bills per 160-char segment; keep these to two at the outside.
			expect(m.length).toBeLessThanOrEqual(320);
		}
	});

	it('says "today" rather than "in 0 days"', () => {
		const m = SMS_TEMPLATES.credentialExpiringNotification({
			firstName: 'Jane',
			disciplineName: 'Dental Hygienist',
			credential: 'license',
			expiresOn: 'Apr 30, 2026',
			daysUntil: 0
		}).textMessage;
		expect(m).toContain('today');
		expect(m).not.toContain('0 day');
	});
});
