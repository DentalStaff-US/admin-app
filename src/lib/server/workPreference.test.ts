import { describe, it, expect } from 'vitest';
import {
	effectiveWorkPreference,
	hasWorkPreference,
	normalizeWorkPreference,
	wantsPermanentWork,
	wantsRequisition,
	wantsTempWork,
	workPreferenceExclusionReason,
	WORK_PREFERENCES
} from './workPreference';

describe('the default is BOTH — never answered must never cost someone work', () => {
	it.each([[null], [undefined], [''], ['nonsense'], [42], [{}]])(
		'treats %j as BOTH',
		(input) => {
			const pref = input as never;
			expect(effectiveWorkPreference(pref)).toBe('BOTH');
			expect(wantsTempWork(pref)).toBe(true);
			expect(wantsPermanentWork(pref)).toBe(true);
		}
	);

	it('shows BOTH boards to a professional who has never answered', () => {
		// The regression test. If either of these ever returns false for null, every
		// professional who predates this column loses a whole job board, silently.
		expect(wantsRequisition(null, false)).toBe(true);
		expect(wantsRequisition(null, true)).toBe(true);
	});

	it('resolves an unrecognised stored value to BOTH rather than throwing', () => {
		// A newly-added or corrupted enum value must not be able to empty a board.
		expect(wantsRequisition('CONTRACT' as never, false)).toBe(true);
		expect(wantsRequisition('CONTRACT' as never, true)).toBe(true);
	});
});

describe('hasWorkPreference', () => {
	it.each([[null], [undefined], [''], ['both']])('is false for %j', (input) => {
		expect(hasWorkPreference(input as never)).toBe(false);
	});

	it.each(WORK_PREFERENCES.map((p) => [p]))('is true for %s', (pref) => {
		expect(hasWorkPreference(pref)).toBe(true);
	});

	it('is true for an explicit BOTH, which is NOT the same as never set', () => {
		// The distinction the nullable column exists to preserve.
		expect(hasWorkPreference('BOTH')).toBe(true);
		expect(hasWorkPreference(null)).toBe(false);
		// Both nonetheless see everything.
		expect(wantsRequisition('BOTH', true)).toBe(wantsRequisition(null, true));
	});
});

describe('wantsRequisition — the one predicate call sites use', () => {
	it.each([
		// pref,        permanentPosition, expected
		['TEMP', false, true],
		['TEMP', true, false],
		['PERMANENT', false, false],
		['PERMANENT', true, true],
		['BOTH', false, true],
		['BOTH', true, true]
	])('%s + permanentPosition=%s → %s', (pref, permanent, expected) => {
		expect(wantsRequisition(pref as never, permanent as boolean)).toBe(expected);
	});

	it.each([[null], [undefined]])(
		'treats permanentPosition=%j as temp, matching the column default',
		(permanent) => {
			expect(wantsRequisition('TEMP', permanent as never)).toBe(true);
			expect(wantsRequisition('PERMANENT', permanent as never)).toBe(false);
		}
	);

	it('guards the two shorthands this module exists to prevent', () => {
		// `pref === 'BOTH'` would exclude everyone who never answered…
		expect(wantsTempWork(null)).toBe(true);
		// …and `pref !== 'PERMANENT'` would wrongly include permanent-only pros on
		// the perm board check. The named helpers get both directions right.
		expect(wantsPermanentWork('TEMP')).toBe(false);
	});
});

describe('normalizeWorkPreference', () => {
	it.each([
		['TEMP', 'TEMP'],
		['temp', 'TEMP'],
		['Permanent', 'PERMANENT'],
		['BOTH', 'BOTH']
	])('accepts %j as %s', (input, expected) => {
		expect(normalizeWorkPreference(input)).toEqual({ ok: true, value: expected });
	});

	it.each([[null], [undefined], ['']])('treats %j as an explicit reset to default', (input) => {
		expect(normalizeWorkPreference(input)).toEqual({ ok: true, value: null });
	});

	it.each([['CONTRACT'], [1], [{}], [['TEMP']]])('rejects %j', (input) => {
		expect(normalizeWorkPreference(input)).toEqual({ ok: false, reason: 'INVALID' });
	});
});

describe('workPreferenceExclusionReason', () => {
	it('explains a temp board emptied by a permanent-only preference', () => {
		const reason = workPreferenceExclusionReason('PERMANENT', 'TEMP');
		expect(reason?.preference).toBe('PERMANENT');
		expect(reason?.message).toContain('permanent positions only');
	});

	it('explains a permanent board emptied by a temp-only preference', () => {
		const reason = workPreferenceExclusionReason('TEMP', 'PERMANENT');
		expect(reason?.preference).toBe('TEMP');
		expect(reason?.message).toContain('temporary shifts only');
	});

	it('returns null when the preference is NOT the reason', () => {
		// Must not overwrite the board's other explanations (no disciplines,
		// cert-locked, nothing nearby).
		expect(workPreferenceExclusionReason('BOTH', 'TEMP')).toBeNull();
		expect(workPreferenceExclusionReason('BOTH', 'PERMANENT')).toBeNull();
		expect(workPreferenceExclusionReason(null, 'TEMP')).toBeNull();
		expect(workPreferenceExclusionReason(null, 'PERMANENT')).toBeNull();
		expect(workPreferenceExclusionReason('TEMP', 'TEMP')).toBeNull();
		expect(workPreferenceExclusionReason('PERMANENT', 'PERMANENT')).toBeNull();
	});
});
