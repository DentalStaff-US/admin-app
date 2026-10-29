import { describe, it, expect } from 'vitest';
import {
	applySnoozes,
	classifyProfessional,
	snoozeKey,
	sortComplianceItems,
	summarizeCompliance,
	type ProfessionalCredentialRow
} from '$lib/server/compliance/complianceRule';

const today = '2026-10-27';
const notRequired = { required: false, expiresOn: null };

const row = (over: Partial<ProfessionalCredentialRow> = {}): ProfessionalCredentialRow => ({
	candidateId: 'c1',
	name: 'Dana Smith',
	disciplineId: 'd1',
	disciplineName: 'Registered Dental Hygienist',
	abbreviation: 'RDH',
	license: { required: true, expiresOn: '2027-06-30' },
	certification: notRequired,
	...over
});

const shift = { requisitionId: 20232, recurrenceDayId: 'rd1', date: '2026-10-30' };

describe('classifyProfessional', () => {
	it('produces nothing for a valid or not-required credential', () => {
		expect(classifyProfessional(row(), [], today)).toEqual([]);
	});

	it('flags an expiring license as WATCH', () => {
		const [item] = classifyProfessional(
			row({ license: { required: true, expiresOn: '2026-11-15' } }),
			[],
			today
		);
		expect(item.severity).toBe('WATCH');
		expect(item.dueOn).toBe('2026-11-15');
		expect(item.ruleKey).toBe('LICENSE:d1');
	});

	it('flags an expired license as BLOCKED without booked shifts', () => {
		const [item] = classifyProfessional(
			row({ license: { required: true, expiresOn: '2026-10-01' } }),
			[],
			today
		);
		expect(item.severity).toBe('BLOCKED');
		expect(item.upcomingShifts).toEqual([]);
	});

	it('upgrades an expired credential with booked shifts to CRITICAL', () => {
		const [item] = classifyProfessional(
			row({ license: { required: true, expiresOn: '2026-10-01' } }),
			[shift],
			today
		);
		expect(item.severity).toBe('CRITICAL');
		expect(item.upcomingShifts).toEqual([shift]);
	});

	it('does not raise a merely-expiring credential to CRITICAL for booked shifts', () => {
		const [item] = classifyProfessional(
			row({ license: { required: true, expiresOn: '2026-11-15' } }),
			[shift],
			today
		);
		expect(item.severity).toBe('WATCH');
	});

	it('treats a missing license as ACTION, with grace left when notified', () => {
		const [notNotified] = classifyProfessional(
			row({ license: { required: true, expiresOn: null } }),
			[],
			today
		);
		expect(notNotified.severity).toBe('ACTION');
		expect(notNotified.dueOn).toBeNull();

		const [inGrace] = classifyProfessional(
			row({ license: { required: true, expiresOn: null, graceStartedOn: '2026-10-20' } }),
			[],
			today
		);
		expect(inGrace.severity).toBe('ACTION');
		expect(inGrace.dueOn).toBe('2026-11-19');
		expect(inGrace.detail).toContain('23 days of grace left');
	});

	it('blocks once the missing-license grace has run out', () => {
		const [item] = classifyProfessional(
			row({ license: { required: true, expiresOn: null, graceStartedOn: '2026-09-01' } }),
			[],
			today
		);
		expect(item.severity).toBe('BLOCKED');
	});

	it('emits one item per lapsed track', () => {
		const items = classifyProfessional(
			row({
				license: { required: true, expiresOn: '2026-10-01' },
				certification: { required: true, expiresOn: '2026-10-10' }
			}),
			[],
			today
		);
		expect(items.map((i) => i.ruleKey)).toEqual(['LICENSE:d1', 'CERTIFICATION:d1']);
	});

	it('marks a dateless certification as not remindable', () => {
		const [item] = classifyProfessional(
			row({ license: notRequired, certification: { required: true, expiresOn: null } }),
			[],
			today
		);
		expect(item.severity).toBe('ACTION');
		expect(item.remindable).toBe(false);
	});
});

describe('snoozes and summary', () => {
	const watch = classifyProfessional(
		row({ license: { required: true, expiresOn: '2026-11-15' } }),
		[],
		today
	)[0];
	const critical = classifyProfessional(
		row({ candidateId: 'c2', name: 'Alex Lee', license: { required: true, expiresOn: '2026-10-01' } }),
		[shift],
		today
	)[0];

	it('hides an actively snoozed item from the widget counts', () => {
		const snoozes = new Map([[snoozeKey('PROFESSIONAL', 'c1', 'LICENSE:d1'), '2026-11-03']]);
		const items = applySnoozes([watch, critical], snoozes, today);
		const summary = summarizeCompliance(items);
		expect(summary.counts.WATCH).toBe(0);
		expect(summary.counts.CRITICAL).toBe(1);
		expect(summary.snoozed).toBe(1);
	});

	it('ignores an expired snooze', () => {
		const snoozes = new Map([[snoozeKey('PROFESSIONAL', 'c1', 'LICENSE:d1'), '2026-10-20']]);
		expect(applySnoozes([watch], snoozes, today)[0].snoozedUntil).toBeNull();
	});

	it('never snoozes a CRITICAL item', () => {
		const snoozes = new Map([[snoozeKey('PROFESSIONAL', 'c2', 'LICENSE:d1'), '2026-12-01']]);
		expect(applySnoozes([critical], snoozes, today)[0].snoozedUntil).toBeNull();
	});

	it('sorts most urgent first', () => {
		expect(sortComplianceItems([watch, critical]).map((i) => i.severity)).toEqual([
			'CRITICAL',
			'WATCH'
		]);
	});
});
