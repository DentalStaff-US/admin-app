import {
	pgTable,
	text,
	timestamp,
	boolean,
	smallint,
	date,
	pgEnum,
	uuid
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
	adminPaymentFee: smallint('admin_payment_fee').notNull().default(0),
	adminPaymentFeeType: adminPaymentFeeTypeEnum('admin_payment_fee_type')
		.notNull()
		.default('PERCENTAGE'),
	defaultSearchRadiusMiles: smallint('default_search_radius_miles').notNull().default(60)
});
