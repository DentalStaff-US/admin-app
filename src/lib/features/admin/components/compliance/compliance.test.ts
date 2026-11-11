import { describe, expect, it } from 'vitest';
import { complianceTabs, reminderHint, SEVERITY_TONE } from './compliance';

const href = (s: string | null) => (s ? `?severity=${s}` : '?');

describe('complianceTabs', () => {
	it('always offers All with the total, and hides severities with nothing waiting', () => {
		const tabs = complianceTabs({ CRITICAL: 2, BLOCKED: 0, ACTION: 3, WATCH: 0 }, null, href);
		expect(tabs.map((t) => [t.value, t.count])).toEqual([
			['ALL', 5],
			['CRITICAL', 2],
			['ACTION', 3]
		]);
	});

	it('keeps the active chip even at zero, so the filter can be seen and left', () => {
		const tabs = complianceTabs({ CRITICAL: 0, BLOCKED: 0, ACTION: 0, WATCH: 0 }, 'WATCH', href);
		expect(tabs.map((t) => t.value)).toEqual(['ALL', 'WATCH']);
		expect(tabs[1].href).toBe('?severity=WATCH');
	});

	it('tones the counts as a call to action', () => {
		const tabs = complianceTabs({ CRITICAL: 1, BLOCKED: 1, ACTION: 1, WATCH: 1 }, null, href);
		expect(tabs.slice(1).map((t) => t.tone)).toEqual(['negative', 'negative', 'warning', 'pending']);
		expect(tabs[0].tone).toBeUndefined();
	});
});

describe('reminderHint', () => {
	const now = new Date('2026-11-10T12:00:00Z');
	it('says what Remind does when no reminder is pending', () => {
		expect(reminderHint(null, now)).toMatch(/asking for the renewed credential/);
	});
	it('explains the 24-hour throttle on a disabled Remind (W5)', () => {
		expect(reminderHint('2026-11-10T09:00:00Z', now)).toBe('Reminded 3 hours ago. You can send another in 21 hours.');
		expect(reminderHint('2026-11-10T11:58:00Z', now)).toBe('Reminded 2 minutes ago. You can send another in 24 hours.');
		expect(reminderHint('2026-11-09T12:30:00Z', now)).toBe('Reminded 24 hours ago. You can send another within the hour.');
	});
});

describe('SEVERITY_TONE', () => {
	it('keeps both credential failures negative (W4)', () => {
		expect(SEVERITY_TONE.CRITICAL).toBe('negative');
		expect(SEVERITY_TONE.BLOCKED).toBe('negative');
	});
});
