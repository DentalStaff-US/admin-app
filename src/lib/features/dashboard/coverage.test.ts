import { describe, expect, it } from 'vitest';
import { buildCoverage, coverageByDay, fillState, groupShiftsByDay } from './coverage';
import type { CoverageShift } from './types';

const DAYS = ['2026-11-10', '2026-11-11', '2026-11-12'];
let n = 0;
const shift = (locationId: string, date: string, status: string, over: Partial<CoverageShift> = {}): CoverageShift => ({
	id: `s${n++}`,
	requisitionId: 1,
	locationId,
	locationName: locationId === 'a' ? 'Tampa' : 'Brandon',
	companyName: locationId === 'a' ? 'Bright Smiles' : 'Coastal Dental',
	date,
	dayStart: new Date(`${date}T12:30:00Z`),
	dayEnd: new Date(`${date}T21:00:00Z`),
	timezone: 'America/New_York',
	status,
	disciplineName: 'Hygienist',
	professionalName: status === 'FILLED' ? 'Maria Chen' : null,
	...over
});

describe('fillState', () => {
	it('names each state', () => {
		expect(fillState(0, 0)).toBe('none');
		expect(fillState(0, 2)).toBe('open');
		expect(fillState(1, 2)).toBe('partial');
		expect(fillState(2, 2)).toBe('filled');
	});
});

describe('buildCoverage', () => {
	const shifts = [
		shift('a', '2026-11-10', 'FILLED'),
		shift('a', '2026-11-10', 'FILLED'),
		shift('b', '2026-11-10', 'OPEN'),
		shift('b', '2026-11-11', 'FILLED'),
		shift('b', '2026-11-11', 'OPEN'),
		shift('b', '2026-11-12', 'CANCELED'),
		shift('a', '2026-11-20', 'OPEN')
	];
	const rows = buildCoverage(shifts, DAYS);

	it('counts filled over total per location-day, ignoring cancelled and out-of-range shifts', () => {
		const b = rows.find((r) => r.locationId === 'b')!;
		expect(b.cells.map((c) => `${c.filled}/${c.total}`)).toEqual(['0/1', '1/2', '0/0']);
		expect(b.cells.map((c) => c.state)).toEqual(['open', 'partial', 'none']);
	});

	it('puts the location with most gaps first', () => {
		expect(rows.map((r) => r.locationId)).toEqual(['b', 'a']);
		expect(rows[0].openShifts).toBe(2);
	});

	it('gives the phone view one list per day, worst first', () => {
		const days = coverageByDay(rows, DAYS);
		expect(days[0]).toMatchObject({ date: '2026-11-10', filled: 2, total: 3 });
		expect(days[0].entries[0].row.locationId).toBe('b');
		expect(days[2].entries).toHaveLength(0);
	});
});

describe('groupShiftsByDay', () => {
	it('groups in time order and drops cancelled shifts', () => {
		const groups = groupShiftsByDay([
			shift('a', '2026-11-11', 'OPEN'),
			shift('a', '2026-11-10', 'FILLED'),
			shift('a', '2026-11-10', 'CANCELED')
		]);
		expect(groups.map((g) => [g.date, g.shifts.length])).toEqual([
			['2026-11-10', 1],
			['2026-11-11', 1]
		]);
	});
});
