import {
	pgTable,
	text,
	timestamp,
	boolean,
	smallint,
	date,
	pgEnum,
	uuid,
	decimal
} from 'drizzle-orm/pg-core';

export const adminPaymentFeeTypeEnum = pgEnum('admin_payment_fee_type_enum', [
	'PERCENTAGE',
	'FIXED'
]);

export const adminConfigTable = pgTable('admin_config', {
	id: text('id').notNull().primaryKey().default(crypto.randomUUID()),
	createdAt: timestamp('created_at', {
		withTimezone: true,
		mode: 'date'
	})
		.notNull()
		.default(new Date()),
	updatedAt: timestamp('updated_at', {
		withTimezone: true,
		mode: 'date'
	})
		.notNull()
		.default(new Date()),
	// The PLATFORM fee — what DTSS charges the practice, billed as the
	// "Administration Fees" line on the invoice. Applied to REGULAR HOURS ONLY;
	// overtime is exempt. Unrelated to affiliate commission below.
	adminPaymentFee: smallint('admin_payment_fee').notNull().default(0),
	adminPaymentFeeType: adminPaymentFeeTypeEnum('admin_payment_fee_type')
		.notNull()
		.default('PERCENTAGE'),
	defaultSearchRadiusMiles: smallint('default_search_radius_miles').notNull().default(60),

	// --- Affiliate program -------------------------------------------------
	// Money DTSS pays OUT, entirely separate from adminPaymentFee above. Percent
	// of the commissionable base (regular hours only). numeric(5,2) rather than
	// smallint so fractional rates like 2.5% are expressible.
	// A per-affiliate `commission_rate_override` takes precedence over this.
	affiliateCommissionRate: decimal('affiliate_commission_rate', { precision: 5, scale: 2 })
		.notNull()
		.default('2.50'),
	// Balances below this roll forward to the next monthly payout run rather than
	// incurring a Stripe transfer fee on a trivial amount.
	affiliatePayoutMinimum: decimal('affiliate_payout_minimum', { precision: 10, scale: 2 })
		.notNull()
		.default('25.00'),
	// Master kill switch. When false the portal is dark and the affiliate API
	// returns 503 — but `?ref=` capture still runs, so attribution keeps
	// accumulating during a soft launch.
	affiliateProgramEnabled: boolean('affiliate_program_enabled').notNull().default(false)
});
