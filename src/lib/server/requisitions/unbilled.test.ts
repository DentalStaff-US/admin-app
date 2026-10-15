import { describe, expect, it } from 'vitest';
import { parseRequisitionListFilter } from './unbilled';

describe('parseRequisitionListFilter', () => {
	it('accepts allowlisted views', () => {
		expect(parseRequisitionListFilter('unbilled')).toBe('unbilled');
	});

	it('rejects anything else', () => {
		expect(parseRequisitionListFilter(null)).toBeNull();
		expect(parseRequisitionListFilter('')).toBeNull();
		expect(parseRequisitionListFilter('UNBILLED')).toBeNull();
		expect(parseRequisitionListFilter("unbilled' or 1=1")).toBeNull();
	});
});
