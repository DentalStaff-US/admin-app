import { describe, expect, it } from 'vitest';
import { firstError } from './forms';

describe('firstError', () => {
	it('reads every superforms error shape', () => {
		expect(firstError(['Required', 'Too short'])).toBe('Required');
		expect(firstError('Bad')).toBe('Bad');
		expect(firstError({ _errors: ['Pick one'] })).toBe('Pick one');
		expect(firstError(undefined)).toBeUndefined();
		expect(firstError([])).toBeUndefined();
	});
});
