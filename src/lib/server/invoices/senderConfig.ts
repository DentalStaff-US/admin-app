import { env } from '$env/dynamic/private';

/**
 * The "From" (sender) block for generated paper invoices. There is no stored
 * business address in the app (Stripe rendered its own account address on the
 * hosted invoices), so it's supplied via env. Set the INVOICE_FROM_* vars in
 * .env for production; the COMPANY_* / placeholder fallbacks keep dev working.
 */
export type InvoiceSender = {
	name: string;
	email: string;
	phone: string | null;
	streetLine: string | null;
	cityStateZip: string | null;
	country: string | null;
};

export function getInvoiceSender(): InvoiceSender {
	return {
		name: env.INVOICE_FROM_NAME || env.COMPANY_FROM_NAME || 'Dental Temps Staffing Solutions',
		email: env.INVOICE_FROM_EMAIL || env.COMPANY_REPLY_TO_EMAIL || env.COMPANY_FROM_EMAIL || '',
		phone: env.INVOICE_FROM_PHONE || null,
		streetLine: env.INVOICE_FROM_STREET || null,
		cityStateZip: env.INVOICE_FROM_CITY_STATE_ZIP || null,
		country: env.INVOICE_FROM_COUNTRY || 'United States'
	};
}
