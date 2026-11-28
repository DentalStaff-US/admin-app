import { describe, expect, it } from 'vitest';
import { auditActionTone, changedFields, displayValue, visibleMetadata } from './auditTone';

describe('auditActionTone', () => {
	it('maps ledger actions onto the status tones', () => {
		expect(auditActionTone('VIEW')).toBe('neutral');
		expect(auditActionTone('APPROVE')).toBe('positive');
		expect(auditActionTone('VOID')).toBe('negative');
		expect(auditActionTone('IMPERSONATE_START')).toBe('warning');
		expect(auditActionTone('SNOOZE')).toBe('pending');
		expect(auditActionTone('UPDATE')).toBe('info');
		expect(auditActionTone('SOMETHING_NEW')).toBe('info');
	});
});

describe('changedFields', () => {
	it('lists only changed keys and skips timestamps', () => {
		expect(
			changedFields({
				before: { status: 'OPEN', rate: 40, updatedAt: 1 },
				after: { status: 'CLOSED', rate: 40, updatedAt: 2, note: 'x' }
			})
		).toEqual([
			{ key: 'status', before: 'OPEN', after: 'CLOSED' },
			{ key: 'note', before: undefined, after: 'x' }
		]);
		expect(changedFields(null)).toEqual([]);
	});
});

describe('metadata', () => {
	it('hides plumbing keys and stringifies values', () => {
		expect(visibleMetadata({ _internal: 1, navigation: true, reason: 'late' })).toEqual([['reason', 'late']]);
		expect(displayValue(null)).toBe('—');
		expect(displayValue({ a: 1 })).toBe('{"a":1}');
	});
});
