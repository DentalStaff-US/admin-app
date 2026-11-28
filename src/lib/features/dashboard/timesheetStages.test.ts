import { describe, expect, it } from 'vitest';
import { timesheetStages } from './timesheetStages';

describe('timesheetStages', () => {
	it('puts every stage in order, with approved and paid told apart by wages', () => {
		const out = timesheetStages([
			{ status: 'DRAFT', wagesStatus: null, count: 3, hours: 10 },
			{ status: 'PENDING', wagesStatus: null, count: 2, hours: 60 },
			{ status: 'APPROVED', wagesStatus: 'WAGES_DUE', count: 4, hours: 100 },
			{ status: 'APPROVED', wagesStatus: null, count: 1, hours: 8 },
			{ status: 'APPROVED', wagesStatus: 'WAGES_PAID', count: 9, hours: 300 },
			{ status: 'VOID', wagesStatus: null, count: 7, hours: 50 }
		]);
		expect(out.map((s) => [s.label, s.count, s.hours])).toEqual([
			['Draft', 3, 10],
			['Pending', 2, 60],
			['Discrepancies', 0, 0],
			['Approved', 5, 108],
			['Paid', 9, 300]
		]);
		expect(out[1].href).toBe('/timesheets?tab=review');
	});
});
