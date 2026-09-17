import { describe, it, expect } from 'vitest';
import { csvCell, toCsv, money, datedFilename, csvResponse } from '$lib/server/export/csv';

describe('csvCell', () => {
	it('passes plain text through unquoted', () => {
		expect(csvCell('hello')).toBe('hello');
	});

	it('quotes fields containing commas, quotes or newlines and doubles embedded quotes', () => {
		expect(csvCell('a,b')).toBe('"a,b"');
		expect(csvCell('say "hi"')).toBe('"say ""hi"""');
		expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
		expect(csvCell('cr\r\nlf')).toBe('"cr\r\nlf"');
	});

	it('serialises null/undefined as empty', () => {
		expect(csvCell(null)).toBe('');
		expect(csvCell(undefined)).toBe('');
	});

	it('writes dates as ISO 8601', () => {
		expect(csvCell(new Date('2026-09-17T18:47:15.351Z'))).toBe('2026-09-17T18:47:15.351Z');
		expect(csvCell(new Date('invalid'))).toBe('');
	});

	it('writes numbers plainly and booleans as true/false', () => {
		expect(csvCell(14.5)).toBe('14.5');
		expect(csvCell(-14.5)).toBe('-14.5');
		expect(csvCell(true)).toBe('true');
		expect(csvCell(NaN)).toBe('');
	});

	it('defuses spreadsheet formula injection', () => {
		// An affiliate could set their display name to this. Opening the export
		// in Excel must not execute it.
		expect(csvCell('=HYPERLINK("http://evil")')).toBe('"\t=HYPERLINK(""http://evil"")"');
		expect(csvCell('+1234')).toBe('"\t+1234"');
		expect(csvCell('@SUM(A1)')).toBe('"\t@SUM(A1)"');
	});

	it('does NOT defuse genuine negative numbers — they must stay numeric', () => {
		// "-14.50" is a clawback, not a formula.
		expect(csvCell('-14.50')).toBe('-14.50');
		expect(csvCell(-14.5)).toBe('-14.5');
	});
});

describe('toCsv', () => {
	type Row = { name: string; amount: string; when: Date };
	const rows: Row[] = [
		{ name: 'Jane, Dr.', amount: '45.00', when: new Date('2026-08-01T00:00:00Z') },
		{ name: 'Bob', amount: '-14.50', when: new Date('2026-09-01T00:00:00Z') }
	];
	const cols = [
		{ header: 'Name', value: (r: Row) => r.name },
		{ header: 'Amount', value: (r: Row) => money(r.amount) },
		{ header: 'When', value: (r: Row) => r.when }
	];

	it('emits a header row then data rows with CRLF endings', () => {
		expect(toCsv(rows, cols)).toBe(
			'Name,Amount,When\r\n' +
				'"Jane, Dr.",45.00,2026-08-01T00:00:00.000Z\r\n' +
				'Bob,-14.50,2026-09-01T00:00:00.000Z\r\n'
		);
	});

	it('emits just the header for zero rows', () => {
		expect(toCsv([], cols)).toBe('Name,Amount,When\r\n');
	});
});

describe('money', () => {
	it('normalises numeric strings and numbers to 2dp with no symbols', () => {
		expect(money('45')).toBe('45.00');
		expect(money('1234.5')).toBe('1234.50');
		expect(money(14.5)).toBe('14.50');
		expect(money('-14.50')).toBe('-14.50');
	});
	it('is empty for missing or garbage', () => {
		expect(money(null)).toBe('');
		expect(money('')).toBe('');
		expect(money('abc')).toBe('');
	});
});

describe('csvResponse / datedFilename', () => {
	it('sets download headers and sanitises the filename', () => {
		const r = csvResponse('ledger ../x.csv', 'a,b\r\n');
		expect(r.headers.get('content-type')).toContain('text/csv');
		expect(r.headers.get('content-disposition')).toBe('attachment; filename="ledger_.._x.csv"');
		expect(r.headers.get('cache-control')).toBe('no-store');
	});
	it('dates the filename', () => {
		expect(datedFilename('affiliate-ledger', new Date('2026-09-17T23:00:00Z'))).toBe(
			'affiliate-ledger-2026-09-17.csv'
		);
	});
});
