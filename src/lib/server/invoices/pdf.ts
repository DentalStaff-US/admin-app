import PDFDocument from 'pdfkit';
import { DTSS_LOGO_PNG } from './logo';
import type { InvoiceSender } from './senderConfig';

export type InvoicePdfLineItem = {
	description: string;
	quantity: number; // hours (may be fractional) or 1 for expenses/fees
	unitAmountCents: number; // per-unit price, in cents
	amountCents: number; // line total, in cents
};

export type InvoicePdfContext = {
	invoiceNumber: string;
	issueDate: Date;
	dueDate: Date | null;
	status: string; // open | paid | void | uncollectible | draft
	currency: string; // e.g. 'usd'
	description: string | null;
	footer: string | null;
	// Header money is in DOLLARS (the invoices table stores decimals).
	subtotal: number;
	total: number;
	amountDue: number;
	amountPaid: number;
	lineItems: InvoicePdfLineItem[];
	sender: InvoiceSender;
	billTo: {
		contactName: string | null;
		companyName: string | null;
		email: string | null;
		phone: string | null;
		addressLines: string[]; // street, city/state/zip
	};
};

const DARK = '#111827';
const GRAY = '#6b7280';
const RULE = '#e5e7eb';
const ACCENT = '#1a56db';

/**
 * Render a paper invoice as a PDF Buffer, laid out to resemble Stripe's hosted
 * invoice (title + logo, invoice #/dates, From / Bill-to, amount-due headline,
 * line-item table, totals, footer). No "Pay online" link — this is a downloadable
 * document, not a payment page.
 *
 * Units: header amounts (subtotal/total/amountDue/amountPaid) are dollars; line
 * items carry cents (rate/amount) and are divided by 100 here.
 */
export function renderInvoicePdf(ctx: InvoicePdfContext): Promise<Buffer> {
	const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
	const chunks: Buffer[] = [];
	doc.on('data', (c: Buffer) => chunks.push(c));
	const done = new Promise<Buffer>((resolve, reject) => {
		doc.on('end', () => resolve(Buffer.concat(chunks)));
		doc.on('error', reject);
	});

	const currencyCode = (ctx.currency || 'usd').toUpperCase();
	const money = (dollars: number) =>
		new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode }).format(
			Number.isFinite(dollars) ? dollars : 0
		);
	const fmtDate = (d: Date | null) =>
		d
			? new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(
					d
				)
			: '—';
	const fmtQty = (q: number) => {
		const n = Number(q);
		if (!Number.isFinite(n)) return '0';
		return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
	};

	const left = 50;
	const right = doc.page.width - 50; // 562 on LETTER
	// Table columns (right edges).
	const qtyRight = 380;
	const unitRight = 470;
	const amtRight = right;

	const rightText = (text: string, rightX: number, y: number, colWidth: number) =>
		doc.text(text, rightX - colWidth, y, { width: colWidth, align: 'right' });

	// Top accent bar.
	doc.rect(0, 0, doc.page.width, 6).fill(ACCENT);

	// Title + logo.
	doc.font('Helvetica-Bold').fontSize(26).fillColor(DARK).text('Invoice', left, 58);
	try {
		doc.image(DTSS_LOGO_PNG, right - 90, 52, { width: 90 });
	} catch {
		// Logo is best-effort; never let it break invoice rendering.
	}

	// Meta rows.
	let y = 104;
	const metaLabelW = 92;
	const metaRow = (label: string, value: string) => {
		doc
			.font('Helvetica-Bold')
			.fontSize(9)
			.fillColor(DARK)
			.text(label, left, y, { width: metaLabelW });
		doc
			.font('Helvetica')
			.fontSize(9)
			.fillColor(DARK)
			.text(value, left + metaLabelW, y);
		y += 15;
	};
	metaRow('Invoice number', ctx.invoiceNumber);
	metaRow('Date of issue', fmtDate(ctx.issueDate));
	metaRow('Date due', fmtDate(ctx.dueDate));

	// From (left) / Bill to (right).
	const blockTop = y + 22;
	const colRightX = 320;

	// From — sender name + address (no label, matching Stripe's left block).
	doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK).text(ctx.sender.name, left, blockTop, {
		width: 250
	});
	let fy = doc.y + 2;
	doc.font('Helvetica').fontSize(9).fillColor(GRAY);
	for (const line of [
		ctx.sender.streetLine,
		ctx.sender.cityStateZip,
		ctx.sender.country,
		ctx.sender.phone,
		ctx.sender.email
	].filter(Boolean) as string[]) {
		doc.text(line, left, fy, { width: 250 });
		fy = doc.y;
	}

	// Bill to.
	doc.font('Helvetica-Bold').fontSize(9).fillColor(GRAY).text('Bill to', colRightX, blockTop);
	let by = doc.y + 2;
	const billName = ctx.billTo.contactName || ctx.billTo.companyName || '';
	doc
		.font('Helvetica-Bold')
		.fontSize(10)
		.fillColor(DARK)
		.text(billName, colRightX, by, { width: 242 });
	by = doc.y + 2;
	doc.font('Helvetica').fontSize(9).fillColor(GRAY);
	for (const line of [
		ctx.billTo.contactName && ctx.billTo.companyName ? ctx.billTo.companyName : null,
		ctx.billTo.email,
		ctx.billTo.phone,
		...ctx.billTo.addressLines
	].filter(Boolean) as string[]) {
		doc.text(line, colRightX, by, { width: 242 });
		by = doc.y;
	}

	// Amount-due headline.
	let cy = Math.max(fy, by) + 26;
	const headline =
		ctx.status === 'paid'
			? `${money(ctx.total)} ${currencyCode} paid`
			: ctx.status === 'void'
				? `${money(ctx.total)} ${currencyCode} — Void`
				: `${money(ctx.amountDue)} ${currencyCode} due ${fmtDate(ctx.dueDate)}`;
	doc.font('Helvetica-Bold').fontSize(15).fillColor(DARK).text(headline, left, cy);
	cy = doc.y + 6;

	if (ctx.description) {
		doc
			.font('Helvetica')
			.fontSize(9)
			.fillColor(GRAY)
			.text(ctx.description, left, cy, { width: 512 });
		cy = doc.y + 8;
	}

	// Table header.
	let ty = cy + 12;
	doc.font('Helvetica-Bold').fontSize(8).fillColor(GRAY);
	doc.text('Description', left, ty);
	rightText('Qty', qtyRight, ty, 60);
	rightText('Unit price', unitRight, ty, 80);
	rightText('Amount', amtRight, ty, 80);
	ty += 12;
	doc.moveTo(left, ty).lineTo(right, ty).lineWidth(1).strokeColor(RULE).stroke();
	ty += 8;

	// Line items.
	for (const item of ctx.lineItems) {
		if (ty > doc.page.height - 140) {
			doc.addPage();
			ty = 60;
		}
		const rowTop = ty;
		doc
			.font('Helvetica')
			.fontSize(9)
			.fillColor(DARK)
			.text(item.description || '', left, rowTop, {
				width: 270
			});
		const descBottom = doc.y;
		rightText(fmtQty(item.quantity), qtyRight, rowTop, 60);
		rightText(money(item.unitAmountCents / 100), unitRight, rowTop, 80);
		rightText(money(item.amountCents / 100), amtRight, rowTop, 80);
		ty = Math.max(descBottom, rowTop + 12) + 8;
	}

	// Totals (right-hand column).
	ty += 2;
	doc.moveTo(colRightX, ty).lineTo(right, ty).lineWidth(1).strokeColor(RULE).stroke();
	ty += 8;
	const totalRow = (label: string, value: string, bold = false) => {
		doc
			.font(bold ? 'Helvetica-Bold' : 'Helvetica')
			.fontSize(9)
			.fillColor(DARK);
		doc.text(label, colRightX, ty, { width: 130 });
		rightText(value, amtRight, ty, 110);
		ty += 15;
	};
	totalRow('Subtotal', money(ctx.subtotal));
	totalRow('Total', money(ctx.total));
	if (ctx.amountPaid > 0) totalRow('Amount paid', `-${money(ctx.amountPaid)}`);
	totalRow('Amount due', `${money(ctx.amountDue)} ${currencyCode}`, true);

	// Footer.
	doc
		.font('Helvetica')
		.fontSize(8)
		.fillColor(GRAY)
		.text(ctx.footer || 'Thank you for your business.', left, doc.page.height - 70, {
			width: 512
		});

	doc.end();
	return done;
}
