/**
 * CSV export core.
 *
 * The affiliate ledger and payout exports are the first consumers; invoicing
 * and professional wages exports are expected to follow. Keep this generic —
 * the domain-specific part is the column definition each caller supplies.
 *
 * Pure and dependency-free so it is unit-testable and usable from anywhere.
 *
 * Correctness notes (these are the things that silently corrupt spreadsheets):
 *  - RFC 4180 quoting: any field containing a comma, quote, CR or LF is quoted,
 *    and embedded quotes are doubled.
 *  - Money is written as a plain decimal string ("45.00"), never with a currency
 *    symbol or thousands separator, so it stays numeric in Excel/Sheets.
 *  - Dates are ISO 8601 — unambiguous and sortable, unlike locale formats.
 *  - Formula injection: a leading =, +, -, @ is prefixed with a tab so a hostile
 *    value (e.g. an affiliate's display name of "=HYPERLINK(...)") cannot execute
 *    when the file is opened. Pure numerics are exempt, so a negative amount
 *    like "-14.50" (a clawback) stays a number rather than being defused.
 */

export type CsvColumn<Row> = {
	header: string;
	value: (row: Row) => unknown;
};

const NEEDS_QUOTING = /[",\r\n]/;
const FORMULA_LEADER = /^[=+\-@]/;
const PURE_NUMBER = /^-?\d+(\.\d+)?$/;

/** Serialise one value to a CSV cell. */
export function csvCell(value: unknown): string {
	if (value === null || value === undefined) return '';

	let text: string;
	if (value instanceof Date) {
		text = Number.isNaN(value.getTime()) ? '' : value.toISOString();
	} else if (typeof value === 'number') {
		text = Number.isFinite(value) ? String(value) : '';
	} else if (typeof value === 'boolean') {
		text = value ? 'true' : 'false';
	} else {
		text = String(value);
	}

	// Defuse spreadsheet formula injection, but leave genuine numbers (including
	// negatives like "-14.50") untouched so they stay numeric.
	if (FORMULA_LEADER.test(text) && !PURE_NUMBER.test(text)) {
		text = '\t' + text;
	}

	if (NEEDS_QUOTING.test(text) || text.startsWith('\t')) {
		return `"${text.replace(/"/g, '""')}"`;
	}
	return text;
}

/** Build a complete CSV document (header row + data rows) with CRLF line ends. */
export function toCsv<Row>(rows: readonly Row[], columns: readonly CsvColumn<Row>[]): string {
	const header = columns.map((c) => csvCell(c.header)).join(',');
	const body = rows.map((row) => columns.map((c) => csvCell(c.value(row))).join(','));
	return [header, ...body].join('\r\n') + '\r\n';
}

/** A numeric(12,2) dollar string or number → plain "1234.56" for a spreadsheet. */
export function money(value: string | number | null | undefined): string {
	if (value === null || value === undefined || value === '') return '';
	const n = typeof value === 'number' ? value : Number(value);
	return Number.isFinite(n) ? n.toFixed(2) : '';
}

/** Standard download response. Filename is sanitised to a safe subset. */
export function csvResponse(filename: string, csv: string): Response {
	const safe = filename.replace(/[^A-Za-z0-9._-]/g, '_');
	return new Response(csv, {
		status: 200,
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="${safe}"`,
			'cache-control': 'no-store'
		}
	});
}

/** `affiliate-ledger-2026-09-17.csv` */
export function datedFilename(base: string, date: Date = new Date()): string {
	return `${base}-${date.toISOString().slice(0, 10)}.csv`;
}
