import { describe, it, expect } from 'vitest';
import {
	stageFor,
	selectCertRemindersToSend,
	SMS_STAGES,
	CERT_REMINDER_OFFSETS,
	type CertRow
} from './certReminders';

const TODAY = '2026-04-30';

/** 'YYYY-MM-DD' that is `days` away from TODAY. */
function dateIn(days: number): string {
	const d = new Date(`${TODAY}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

function row(over: Partial<CertRow> = {}): CertRow {
	return {
		candidateId: 'cand-1',
		userId: 'user-1',
		firstName: 'Jane',
		lastName: 'Doe',
		email: 'jane@example.com',
		phone: '+15555550123',
		receiveEmail: true,
		receiveSms: true,
		disciplineId: 'disc-rdh',
		disciplineName: 'Dental Hygienist',
		abbreviation: 'RDH',
		effectiveExpiry: dateIn(7),
		...over
	};
}

describe('stageFor', () => {
	it('maps each exact offset to its stage', () => {
		expect(stageFor(60)).toBe('D60');
		expect(stageFor(30)).toBe('D30');
		expect(stageFor(14)).toBe('D14');
		expect(stageFor(7)).toBe('D7');
		expect(stageFor(0)).toBe('D0');
	});

	it('bands between offsets, so a missed run sends LATE rather than never', () => {
		// The whole reason this is banded instead of exact-match: the cron is daily, so
		// an exact-match rule would skip a stage permanently after one missed run.
		expect(stageFor(45)).toBe('D60');
		expect(stageFor(31)).toBe('D60');
		expect(stageFor(29)).toBe('D30');
		expect(stageFor(20)).toBe('D30');
		expect(stageFor(13)).toBe('D14');
		expect(stageFor(8)).toBe('D14');
		expect(stageFor(6)).toBe('D7');
		expect(stageFor(3)).toBe('D7');
		expect(stageFor(1)).toBe('D7');
	});

	it('is EXPIRED once lapsed, however long ago', () => {
		expect(stageFor(-1)).toBe('EXPIRED');
		expect(stageFor(-400)).toBe('EXPIRED');
	});

	it('is silent beyond the first offset', () => {
		expect(stageFor(61)).toBeNull();
		expect(stageFor(365)).toBeNull();
		expect(stageFor(CERT_REMINDER_OFFSETS[0] + 1)).toBeNull();
	});
});

describe('selectCertRemindersToSend', () => {
	it('plans one reminder per due credential', () => {
		const plans = selectCertRemindersToSend([row({ effectiveExpiry: dateIn(7) })], TODAY);
		expect(plans).toHaveLength(1);
		expect(plans[0].stage).toBe('D7');
		expect(plans[0].daysUntil).toBe(7);
	});

	it('skips credentials outside the window', () => {
		expect(selectCertRemindersToSend([row({ effectiveExpiry: dateIn(90) })], TODAY)).toHaveLength(
			0
		);
	});

	it('emails only for the early stages, email+SMS for the last three', () => {
		const at = (d: number) =>
			selectCertRemindersToSend([row({ effectiveExpiry: dateIn(d) })], TODAY)[0];

		expect(at(60).channels).toEqual(['EMAIL']);
		expect(at(30).channels).toEqual(['EMAIL']);
		expect(at(14).channels).toEqual(['EMAIL']);
		expect(at(7).channels).toEqual(['EMAIL', 'SMS']);
		expect(at(0).channels).toEqual(['EMAIL', 'SMS']);
		expect(at(-1).channels).toEqual(['EMAIL', 'SMS']);
	});

	it('matches SMS_STAGES exactly', () => {
		expect([...SMS_STAGES].sort()).toEqual(['D0', 'D7', 'EXPIRED']);
	});

	it('honours per-channel opt-out at audience-build time', () => {
		// Opt-out is never filtered at send time in this codebase, so it has to hold here.
		const emailOff = selectCertRemindersToSend(
			[row({ effectiveExpiry: dateIn(7), receiveEmail: false })],
			TODAY
		);
		expect(emailOff[0].channels).toEqual(['SMS']);

		const smsOff = selectCertRemindersToSend(
			[row({ effectiveExpiry: dateIn(7), receiveSms: false })],
			TODAY
		);
		expect(smsOff[0].channels).toEqual(['EMAIL']);

		const bothOff = selectCertRemindersToSend(
			[row({ effectiveExpiry: dateIn(7), receiveEmail: false, receiveSms: false })],
			TODAY
		);
		expect(bothOff).toHaveLength(0);
	});

	it('does not plan SMS without a phone number', () => {
		const plans = selectCertRemindersToSend(
			[row({ effectiveExpiry: dateIn(0), phone: null })],
			TODAY
		);
		expect(plans[0].channels).toEqual(['EMAIL']);
	});

	it('gives a credential uploaded days before expiry no bogus 60-day notice', () => {
		// Someone uploads a certificate that expires in 3 days: they should get D7,
		// then D0, then EXPIRED — never "expires in 60 days".
		const plans = selectCertRemindersToSend([row({ effectiveExpiry: dateIn(3) })], TODAY);
		expect(plans[0].stage).toBe('D7');
	});

	it('plans per discipline, so two lapsed credentials produce two reminders', () => {
		const plans = selectCertRemindersToSend(
			[
				row({ disciplineId: 'disc-rdh', effectiveExpiry: dateIn(7) }),
				row({ disciplineId: 'disc-da', abbreviation: 'DA', effectiveExpiry: dateIn(-1) })
			],
			TODAY
		);
		expect(plans.map((p) => p.stage)).toEqual(['D7', 'EXPIRED']);
	});
});
