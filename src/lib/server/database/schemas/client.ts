import {
	pgTable,
	text,
	timestamp,
	boolean,
	pgEnum,
	date,
	smallint,
	jsonb,
	decimal,
	customType,
	uuid
} from 'drizzle-orm/pg-core';
import { userTable } from './auth';
import { candidateProfileTable } from './candidate';

export type DaySchedule = {
	openTime: string; // ISO time with timezone e.g. "09:00"
	closeTime: string; // ISO time with timezone e.g. "17:00"
	isClosed: boolean;
	timezone: string; // IANA timezone e.g. "America/New_York"
};

export type OperatingHours = {
	[key: number]: DaySchedule;
};

export const clientInvoiceMethodEnum = pgEnum('client_invoice_method_enum', ['STRIPE', 'PAPER']);

export const clientProfileTable = pgTable('client_profiles', {
	id: text('id').notNull().primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => userTable.id, { onDelete: 'cascade' }),
	createdAt: timestamp('created_at', {
		withTimezone: true,
		mode: 'date'
	})
		.notNull()
		.defaultNow(),
	updatedAt: timestamp('updated_at', {
		withTimezone: true,
		mode: 'date'
	})
		.notNull()
		.defaultNow(),
	birthday: date('birthday'),
	cellPhone: text('cell_phone'),
	clientInvoiceMethod: clientInvoiceMethodEnum('client_invoice_method').default('STRIPE')
	// stripeCustomerId: text('stripe_customer_id')
});

export const clientSubscriptionTable = pgTable('client_subscriptions', {
	id: text('id').notNull().primaryKey(),
	clientId: text('client_id')
		.notNull()
		.references(() => clientProfileTable.id, { onDelete: 'cascade' }),
	createdAt: timestamp('created_at', {
		withTimezone: true,
		mode: 'date'
	})
		.notNull()
		.defaultNow(),
	updatedAt: timestamp('updated_at', {
		withTimezone: true,
		mode: 'date'
	})
		.notNull()
		.defaultNow(),
	status: text('subscription_status'),
	stripeCustomerId: text('stripe_customer_id'),
	priceId: text('price_id'),
	stripeCustomerSetupPending: boolean('stripe_customer_setup_pending').default(false)
});

export const clientCompanyTable = pgTable('client_companies', {
	id: text('id').notNull().primaryKey(),
	clientId: text('client_id')
		.notNull()
		.references(() => clientProfileTable.id, { onDelete: 'cascade' }),
	createdAt: timestamp('created_at', {
		withTimezone: true,
		mode: 'date'
	})
		.notNull()
		.defaultNow(),
	updatedAt: timestamp('updated_at', {
		withTimezone: true,
		mode: 'date'
	})
		.notNull()
		.defaultNow(),
	companyName: text('company_name'),
	licenseNumber: text('license_number').unique(),
	companyLogo: text('company_logo'),
	companyDescription: text('company_description'),
	baseLocation: text('base_location'),
	operatingHours: jsonb('operating_hours')
		.$type<OperatingHours>()
		.default({
			0: {
				openTime: '00:00',
				closeTime: '00:00',
				isClosed: false,
				timezone: 'America/New_York'
			},
			1: {
				openTime: '00:00',
				closeTime: '00:00',
				isClosed: false,
				timezone: 'America/New_York'
			},
			2: {
				openTime: '00:00',
				closeTime: '00:00',
				isClosed: false,
				timezone: 'America/New_York'
			},
			3: {
				openTime: '00:00',
				closeTime: '00:00',
				isClosed: false,
				timezone: 'America/New_York'
			},
			4: {
				openTime: '00:00',
				closeTime: '00:00',
				isClosed: false,
				timezone: 'America/New_York'
			},
			5: {
				openTime: '00:00',
				closeTime: '00:00',
				isClosed: false,
				timezone: 'America/New_York'
			},
			6: {
				openTime: '00:00',
				closeTime: '00:00',
				isClosed: false,
				timezone: 'America/New_York'
			}
		})
});

const geometry = customType<{ data: string; notNull: false; default: false }>({
	dataType() {
		return 'geometry(POINT, 4326)';
	}
});

export const companyOfficeLocationTable = pgTable('company_office_locations', {
	id: text('id').notNull().primaryKey(),
	companyId: text('company_id')
		.notNull()
		.references(() => clientCompanyTable.id, { onDelete: 'cascade' }),
	createdAt: timestamp('created_at', {
		withTimezone: true,
		mode: 'date'
	})
		.notNull()
		.defaultNow(),
	updatedAt: timestamp('updated_at', {
		withTimezone: true,
		mode: 'date'
	})
		.notNull()
		.defaultNow(),
	name: text('location_name').notNull(),
	streetOne: text('street_one'),
	streetTwo: text('street_two'),
	city: text('city'),
	state: text('state'),
	zipcode: text('zipcode'),
	companyPhone: text('company_phone'),
	cellPhone: text('cell_phone'),
	operatingHours: jsonb('operating_hours')
		.$type<OperatingHours>()
		.default({
			0: {
				openTime: '00:00',
				closeTime: '00:00',
				isClosed: false,
				timezone: 'America/New_York'
			},
			1: {
				openTime: '00:00',
				closeTime: '00:00',
				isClosed: false,
				timezone: 'America/New_York'
			},
			2: {
				openTime: '00:00',
				closeTime: '00:00',
				isClosed: false,
				timezone: 'America/New_York'
			},
			3: {
				openTime: '00:00',
				closeTime: '00:00',
				isClosed: false,
				timezone: 'America/New_York'
			},
			4: {
				openTime: '00:00',
				closeTime: '00:00',
				isClosed: false,
				timezone: 'America/New_York'
			},
			5: {
				openTime: '00:00',
				closeTime: '00:00',
				isClosed: false,
				timezone: 'America/New_York'
			},
			6: {
				openTime: '00:00',
				closeTime: '00:00',
				isClosed: false,
				timezone: 'America/New_York'
			}
		}),
	email: text('email'),
	timezone: text('timezone').notNull().default('America/New_York'),
	completeAddress: text('complete_address'),
	lat: decimal('lat'),
	lon: decimal('lon'),
	geom: geometry('geom')
});

export const locationContactDestinationTypeEnum = pgEnum('location_contact_destination_type', [
	'EMAIL',
	'SMS'
]);

export const locationContactDestinationTable = pgTable('location_contact_destinations', {
	id: uuid('id').notNull().defaultRandom().primaryKey(),
	locationId: text('location_id')
		.notNull()
		.references(() => companyOfficeLocationTable.id, { onDelete: 'cascade' }),
	type: locationContactDestinationTypeEnum('type').notNull(),
	value: text('value').notNull(),
	createdAt: timestamp('created_at', {
		withTimezone: true,
		mode: 'date'
	})
		.notNull()
		.defaultNow(),
	updatedAt: timestamp('updated_at', {
		withTimezone: true,
		mode: 'date'
	})
		.notNull()
		.defaultNow()
});

export const staffRoleEnum = pgEnum('staff_roles', [
	'CLIENT_ADMIN',
	'CLIENT_MANAGER',
	'CLIENT_EMPLOYEE'
]);

export const clientStaffProfileTable = pgTable('client_staff', {
	id: text('id').notNull().primaryKey(),
	createdAt: timestamp('created_at', {
		withTimezone: true,
		mode: 'date'
	})
		.notNull()
		.defaultNow(),
	updatedAt: timestamp('updated_at', {
		withTimezone: true,
		mode: 'date'
	})
		.notNull()
		.defaultNow(),
	userId: text('user_id')
		.notNull()
		.references(() => userTable.id, { onDelete: 'cascade' }),
	clientId: text('client_id')
		.notNull()
		.references(() => clientProfileTable.id, { onDelete: 'cascade' }),
	companyId: text('company_id')
		.notNull()
		.references(() => clientCompanyTable.id, { onDelete: 'cascade' }),
	staffRole: staffRoleEnum('staff_role').default('CLIENT_EMPLOYEE'),
	birthday: date('birthday')
});

export const clientStaffLocationTable = pgTable('client_staff_locations', {
	id: text('id').notNull().primaryKey(),
	createdAt: timestamp('created_at', {
		withTimezone: true,
		mode: 'date'
	})
		.notNull()
		.defaultNow(),
	updatedAt: timestamp('updated_at', {
		withTimezone: true,
		mode: 'date'
	})
		.notNull()
		.defaultNow(),
	companyId: text('company_id')
		.notNull()
		.references(() => clientCompanyTable.id, { onDelete: 'cascade' }),
	staffId: text('staff_id')
		.notNull()
		.references(() => clientStaffProfileTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
	locationId: text('location_id')
		.notNull()
		.references(() => companyOfficeLocationTable.id, { onDelete: 'cascade' }),
	isPrimary: boolean('is_primary_location').default(false)
});

export const clientRatingTable = pgTable('client_ratings', {
	id: text('id').notNull().primaryKey(),
	clientCompanyId: text('client_company_id')
		.notNull()
		.references(() => clientCompanyTable.id, { onDelete: 'cascade' }),
	ratedById: text('rated_by_id')
		.notNull()
		.references(() => candidateProfileTable.id, { onDelete: 'cascade' }),
	createdAt: timestamp('created_at', {
		withTimezone: true,
		mode: 'date'
	})
		.notNull()
		.defaultNow(),
	updatedAt: timestamp('updated_at', {
		withTimezone: true,
		mode: 'date'
	})
		.notNull()
		.defaultNow(),
	notes: text('notes'),
	rating: smallint('rating').notNull()
});

export const clientDocumentTypeEnum = pgEnum('client_document_type', [
	'LICENSE',
	'CERTIFICATE',
	'AGGREEMENT',
	'OTHER'
]);

export const clientDocumentUploadsTable = pgTable('client_document_uploads', {
	id: uuid('id').notNull().primaryKey(),
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
	clientId: text('client_id')
		.references(() => clientProfileTable.id)
		.notNull(),
	uploadUrl: text('upload_url').notNull(),
	expiryDate: timestamp('expiry_date', {
		withTimezone: true,
		mode: 'date'
	}),
	type: clientDocumentTypeEnum('type').notNull(),
	filename: text('filename'),
	adminOnly: boolean('admin_only').default(false)
});

export type ClientProfile = typeof clientProfileTable.$inferInsert;
export type ClientCompany = typeof clientCompanyTable.$inferInsert;
export type ClientCompanyLocation = typeof companyOfficeLocationTable.$inferInsert;
export type ClientCompanyStaffProfile = typeof clientStaffProfileTable.$inferInsert;
export type ClientCompanyStaffLocation = typeof clientStaffLocationTable.$inferSelect;
export type NewClientCompanyStaffLocation = typeof clientStaffLocationTable.$inferInsert;
export type ClientRating = typeof clientRatingTable.$inferInsert;
export type ClientDocumentUpload = typeof clientDocumentUploadsTable.$inferInsert;
export type LocationContactDestination = typeof locationContactDestinationTable.$inferInsert;
export type LocationContactDestinationSelect = typeof locationContactDestinationTable.$inferSelect;

export type UpdateClientProfile = Partial<typeof clientProfileTable.$inferInsert>;
export type UpdateClientCompany = Partial<typeof clientCompanyTable.$inferInsert>;
export type UpdateClientCompanyLocation = Partial<typeof companyOfficeLocationTable.$inferInsert>;
export type UpdateClientCompanyStaffProfile = Partial<typeof clientStaffProfileTable.$inferInsert>;
export type UpdateClientCompanyStaffLocation = Partial<
	typeof clientStaffLocationTable.$inferInsert
>;
export type UpdateClientRating = Partial<typeof clientRatingTable.$inferInsert>;
export type UpdateClientDocumentUpload = Partial<typeof clientDocumentUploadsTable.$inferInsert>;

export type ClientCompanySelect = typeof clientCompanyTable.$inferSelect;
export type ClientCompanyLocationSelect = typeof companyOfficeLocationTable.$inferSelect;
export type ClientCompanyStaffProfileSelect = typeof clientStaffProfileTable.$inferSelect;
export type ClientCompanyStaffLocationSelect = typeof clientStaffLocationTable.$inferSelect;
export type ClientRatingSelect = typeof clientRatingTable.$inferSelect;
export type ClientProfileSelect = typeof clientProfileTable.$inferSelect;
export type ClientDocumentUploadSelect = typeof clientDocumentUploadsTable.$inferSelect;
