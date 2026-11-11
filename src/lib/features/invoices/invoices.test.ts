// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
	inInvoiceTab,
	invoiceMethodNotice,
	isInvoiceOverdue,
	readInvoiceListQuery,
	shapeInvoiceList,
	toInvoiceListRow,
	toLineItemRows
} from './invoices';

const today = new Date('2026-11-10T12:00:00');
const raw = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
	invoice: {
		id,
		invoiceNumber: `INV-${id}`,
		status,
		invoiceType: 'STRIPE',
		total: '100.00',
		createdAt: '2026-11-01T00:00:00Z',
		dueDate: '2026-11-20T00:00:00Z',
		...extra
	},
	company: { companyName: 'Bright Smiles' },
	candidate: { user: { firstName: 'Maria', lastName: 'Lopez' } },
	requisition: { id: 9 }
});

describe('invoice list', () => {
	const rows = [
		raw('1', 'open'),
		raw('2', 'open', { dueDate: '2026-11-01T00:00:00Z', total: '250' }),
		raw('3', 'paid', { dueDate: '2026-11-01T00:00:00Z', invoiceType: 'PAPER' }),
		raw('4', 'void', { dueDate: '2026-11-01T00:00:00Z' })
	].map((r) => toInvoiceListRow(r, today));

	it('shapes a row and flags overdue only while collectable', () => {
		expect(rows[1]).toMatchObject({ number: 'INV-2', overdue: true, total: 250, professional: 'Maria Lopez', method: 'STRIPE' });
		expect(rows[2].overdue).toBe(false);
		expect(rows[3].overdue).toBe(false);
		expect(isInvoiceOverdue('open', null, today)).toBe(false);
	});

	it('keeps voided invoices out of All', () => {
		expect(inInvoiceTab(rows[3], 'all')).toBe(false);
		const out = shapeInvoiceList(rows, readInvoiceListQuery(new URL('http://x/invoices')));
		expect(out.counts).toEqual({ all: 3, open: 2, overdue: 1, paid: 1, voided: 1 });
	});

	it('filters by method and sorts by amount', () => {
		const q = readInvoiceListQuery(new URL('http://x/invoices?sort=amount&dir=desc'));
		expect(shapeInvoiceList(rows, q).rows.map((r) => r.id)).toEqual(['2', '1', '3']);
		expect(shapeInvoiceList(rows, { ...q, method: ['PAPER'] }).rows.map((r) => r.id)).toEqual(['3']);
		expect(shapeInvoiceList(rows, q).facets.method).toEqual([
			{ value: 'PAPER', label: 'Paper', count: 1 },
			{ value: 'STRIPE', label: 'Stripe', count: 2 }
		]);
	});
});

describe('line items', () => {
	it('converts cents to dollars and prefers the pre-tax unit amount', () => {
		expect(toLineItemRows([{ description: 'Hygienist, 8 hrs', quantity: 8, unit_amount: 5000, unit_amount_excluding_tax: 4800, amount: 38400 }, {}])).toEqual([
			{ key: 0, description: 'Hygienist, 8 hrs', quantity: 8, rate: 48, amount: 384 },
			{ key: 1, description: 'Service', quantity: 1, rate: 0, amount: 0 }
		]);
	});
});

describe('invoiceMethodNotice', () => {
	it('tells admins that PAPER overrides a Stripe customer', () => {
		const n = invoiceMethodNotice({ invoiceType: 'PAPER', clientMethod: 'PAPER', isAdmin: true });
		expect(n.body).toContain('client_invoice_method = PAPER overrides a connected Stripe customer');
		expect(n.tone).toBe('info');
	});
	it('warns when the invoice and the practice disagree', () => {
		expect(invoiceMethodNotice({ invoiceType: 'STRIPE', clientMethod: 'PAPER', isAdmin: true })).toMatchObject({ tone: 'warning' });
		expect(invoiceMethodNotice({ invoiceType: 'PAPER', clientMethod: 'STRIPE', isAdmin: true })).toMatchObject({ tone: 'warning' });
	});
	it('gives practices plain words without the flag name', () => {
		const n = invoiceMethodNotice({ invoiceType: 'PAPER', clientMethod: 'PAPER', isAdmin: false });
		expect(n.title).toBe('Paper invoice');
		expect(n.body).not.toContain('client_invoice_method');
	});
});
