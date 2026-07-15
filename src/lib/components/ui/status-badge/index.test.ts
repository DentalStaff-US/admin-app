import { describe, it, expect } from 'vitest';
import { statusKind, statusBadgeClass, statusLabel } from './index';

describe('statusKind', () => {
	it.each([
		['APPROVED', 'positive'],
		['ACTIVE', 'positive'],
		['paid', 'positive'],
		['WAGES_PAID', 'positive'],
		['FILLED', 'positive'],
		['SUCCESSFUL', 'positive']
	])('classifies %s as positive', (input, expected) => {
		expect(statusKind(input)).toBe(expected);
	});

	it.each([
		['OPEN', 'info'],
		['open', 'info'],
		['NEW', 'info']
	])('classifies %s as info', (input, expected) => {
		expect(statusKind(input)).toBe(expected);
	});

	it('classifies PENDING as pending', () => {
		expect(statusKind('PENDING')).toBe('pending');
	});

	it.each([
		['DISCREPANCY', 'warning'],
		['UNFULFILLED', 'warning'],
		['WAGES_DUE', 'warning']
	])('classifies %s as warning', (input, expected) => {
		expect(statusKind(input)).toBe(expected);
	});

	it.each([
		['REJECTED', 'negative'],
		['DENIED', 'negative'],
		['FAILED', 'negative'],
		['uncollectible', 'negative'],
		['VOID', 'negative'],
		['void', 'negative']
	])('classifies %s as negative', (input, expected) => {
		expect(statusKind(input)).toBe(expected);
	});

	it.each([
		['CLOSED', 'neutral'],
		['CANCELED', 'neutral'],
		['CANCELLED', 'neutral'],
		['INACTIVE', 'neutral'],
		['DRAFT', 'neutral'],
		['draft', 'neutral']
	])('classifies %s as neutral', (input, expected) => {
		expect(statusKind(input)).toBe(expected);
	});

	it.each([
		[null],
		[undefined],
		[''],
		['UNKNOWN_STATUS_VALUE'],
		['Open'] // case-sensitive — only `OPEN` and `open` map to info
	])('falls back to neutral for %s', (input) => {
		expect(statusKind(input)).toBe('neutral');
	});
});

describe('statusBadgeClass', () => {
	it('returns the green class set for positive statuses', () => {
		const cls = statusBadgeClass('APPROVED');
		expect(cls).toContain('bg-green-100');
		expect(cls).toContain('text-green-800');
		expect(cls).toContain('border-green-200');
	});

	it('returns the blue class set for info statuses', () => {
		const cls = statusBadgeClass('OPEN');
		expect(cls).toContain('bg-blue-100');
		expect(cls).toContain('text-blue-800');
	});

	it('returns the yellow class set for PENDING', () => {
		expect(statusBadgeClass('PENDING')).toContain('bg-yellow-100');
	});

	it('returns the orange class set for warning statuses', () => {
		expect(statusBadgeClass('DISCREPANCY')).toContain('bg-orange-100');
	});

	it('returns the red class set for negative statuses', () => {
		expect(statusBadgeClass('REJECTED')).toContain('bg-red-100');
	});

	it('returns the gray class set for neutral / unknown statuses', () => {
		expect(statusBadgeClass('CANCELED')).toContain('bg-gray-100');
		expect(statusBadgeClass(null)).toContain('bg-gray-100');
		expect(statusBadgeClass('SOMETHING_BIZARRE')).toContain('bg-gray-100');
	});
});

describe('statusLabel', () => {
	it.each([
		['WAGES_DUE', 'Wages Due'],
		['WAGES_PAID', 'Wages Paid'],
		['UNFULFILLED', 'Unfulfilled'],
		['PENDING', 'Pending'],
		['paid', 'Paid'],
		['open', 'Open'],
		['DRAFT', 'Draft'],
		['void', 'Voided'],
		['VOID', 'Voided']
	])('humanizes %s as %s', (input, expected) => {
		expect(statusLabel(input)).toBe(expected);
	});

	it('returns empty string for falsy input', () => {
		expect(statusLabel(null)).toBe('');
		expect(statusLabel(undefined)).toBe('');
		expect(statusLabel('')).toBe('');
	});

	it('handles single words', () => {
		expect(statusLabel('rejected')).toBe('Rejected');
	});

	it('preserves the first-letter capitalization for every space-separated word', () => {
		// Multi-underscore enums should produce title-case output.
		expect(statusLabel('A_B_C')).toBe('A B C');
	});
});
