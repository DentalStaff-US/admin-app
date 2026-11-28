/**
 * Coverage board (10 §3.2): locations × the next 7 days, each cell filled/total.
 * Pure grouping so the grid, the mobile list and the tests agree.
 */
import type { CoverageShift } from './types';

export type FillState = 'none' | 'open' | 'partial' | 'filled';

export type CoverageCell = {
	date: string;
	filled: number;
	total: number;
	state: FillState;
	shifts: CoverageShift[];
};

export type CoverageRow = {
	locationId: string;
	locationName: string;
	companyName: string;
	cells: CoverageCell[];
	/** Cells with at least one unfilled shift. Drives the sort. */
	openCells: number;
	openShifts: number;
};

/** Cancelled shifts aren't part of the target, so they're not counted. */
const COUNTED = new Set(['OPEN', 'FILLED', 'UNFULFILLED']);

export function fillState(filled: number, total: number): FillState {
	if (total === 0) return 'none';
	if (filled >= total) return 'filled';
	if (filled === 0) return 'open';
	return 'partial';
}

export const FILL_STATE_LABEL: Record<FillState, string> = {
	none: 'No shifts',
	open: 'Open',
	partial: 'Partly filled',
	filled: 'Filled'
};

export function buildCoverage(shifts: CoverageShift[], days: string[]): CoverageRow[] {
	const byLocation = new Map<string, { name: string; company: string; shifts: CoverageShift[] }>();
	for (const s of shifts) {
		if (!COUNTED.has(s.status) || !days.includes(s.date)) continue;
		const entry = byLocation.get(s.locationId) ?? { name: s.locationName, company: s.companyName, shifts: [] };
		entry.shifts.push(s);
		byLocation.set(s.locationId, entry);
	}

	const rows: CoverageRow[] = [];
	for (const [locationId, entry] of byLocation) {
		const cells = days.map((date) => {
			const dayShifts = entry.shifts
				.filter((s) => s.date === date)
				.sort((a, b) => new Date(a.dayStart).getTime() - new Date(b.dayStart).getTime());
			const filled = dayShifts.filter((s) => s.status === 'FILLED').length;
			return { date, filled, total: dayShifts.length, state: fillState(filled, dayShifts.length), shifts: dayShifts };
		});
		rows.push({
			locationId,
			locationName: entry.name,
			companyName: entry.company,
			cells,
			openCells: cells.filter((c) => c.state === 'open' || c.state === 'partial').length,
			openShifts: cells.reduce((n, c) => n + (c.total - c.filled), 0)
		});
	}

	// Most gaps first, then by name, so the problems sit at the top.
	return rows.sort(
		(a, b) =>
			b.openCells - a.openCells ||
			b.openShifts - a.openShifts ||
			`${a.companyName} ${a.locationName}`.localeCompare(`${b.companyName} ${b.locationName}`)
	);
}

/** Mobile: one list per day, only locations with shifts that day, gaps first. */
export function coverageByDay(rows: CoverageRow[], days: string[]) {
	return days.map((date, i) => {
		const entries = rows
			.map((row) => ({ row, cell: row.cells[i] }))
			.filter((e) => e.cell.total > 0)
			.sort((a, b) => a.cell.filled / a.cell.total - b.cell.filled / b.cell.total);
		return {
			date,
			entries,
			filled: entries.reduce((n, e) => n + e.cell.filled, 0),
			total: entries.reduce((n, e) => n + e.cell.total, 0)
		};
	});
}

/** Practice upcoming shifts: grouped by day (10 §4.1). */
export function groupShiftsByDay(shifts: CoverageShift[]): { date: string; shifts: CoverageShift[] }[] {
	const map = new Map<string, CoverageShift[]>();
	for (const s of [...shifts].sort((a, b) => new Date(a.dayStart).getTime() - new Date(b.dayStart).getTime())) {
		if (!COUNTED.has(s.status)) continue;
		const list = map.get(s.date) ?? [];
		list.push(s);
		map.set(s.date, list);
	}
	return [...map.entries()].map(([date, list]) => ({ date, shifts: list }));
}
