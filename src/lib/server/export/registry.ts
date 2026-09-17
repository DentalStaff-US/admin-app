/**
 * Registry of downloadable exports for Admin → Records Management → Exports.
 *
 * Adding a new financial export (invoices, wages due/paid, …) is one entry here
 * plus a query function that returns a CSV string — the page and the download
 * endpoint are generic over this list.
 *
 * `group` drives the section headings on the page.
 */
import { ledgerCsv, payoutsCsv } from '$lib/server/affiliate/exports';

export type ExportDateRange = { from?: Date; to?: Date };

export type ExportDefinition = {
	/** URL slug and filename base, e.g. affiliate-ledger-2026-09-17.csv */
	key: string;
	group: string;
	label: string;
	description: string;
	/** What the date range filters on, shown as a hint. */
	dateField: string;
	run: (range: ExportDateRange) => Promise<string>;
};

export const EXPORTS: readonly ExportDefinition[] = [
	{
		key: 'affiliate-ledger',
		group: 'Affiliate Program',
		label: 'Commission ledger',
		description:
			'One row per commission event: affiliate, invoice, base, rate, hours, status, payout, and reversal linkage.',
		dateField: 'revenue date (when the invoice was paid)',
		run: ledgerCsv
	},
	{
		key: 'affiliate-payouts',
		group: 'Affiliate Program',
		label: 'Payouts',
		description:
			'One row per payout: cohort, amount, status, Stripe transfer id, Connect account, failure reason.',
		dateField: 'payout created date',
		run: payoutsCsv
	}
	// Coming: 'invoices', 'wages-due', 'wages-paid' — same shape.
];

export function findExport(key: string): ExportDefinition | undefined {
	return EXPORTS.find((e) => e.key === key);
}

/** Serialisable view for the page (drops the `run` function). */
export function listExports() {
	const groups = new Map<string, Array<Omit<ExportDefinition, 'run'>>>();
	for (const { run: _run, ...def } of EXPORTS) {
		void _run;
		const arr = groups.get(def.group) ?? [];
		arr.push(def);
		groups.set(def.group, arr);
	}
	return Array.from(groups, ([group, items]) => ({ group, items }));
}
