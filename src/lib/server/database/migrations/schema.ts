import { pgTable, foreignKey, pgEnum, text, timestamp, unique, jsonb, boolean, integer, index, smallint, date, numeric, serial, uuid, varchar, json, primaryKey } from "drizzle-orm/pg-core"
  import { sql } from "drizzle-orm"

export const admin_payment_fee_type_enum = pgEnum("admin_payment_fee_type_enum", ['PERCENTAGE', 'FIXED'])
export const candidate_document_type = pgEnum("candidate_document_type", ['RESUME', 'LICENSE', 'CERTIFICATE', 'OTHER'])
export const candidate_status = pgEnum("candidate_status", ['INACTIVE', 'PENDING', 'ACTIVE', 'DENIED'])
export const conversation_type = pgEnum("conversation_type", ['INTERNAL', 'APPLICATION', 'ADMIN_CLIENT', 'ADMIN_CANDIDATE'])
export const in_app_notification_status = pgEnum("in_app_notification_status", ['UNREAD', 'READ'])
export const invoice_source_type = pgEnum("invoice_source_type", ['timesheet', 'manual', 'recurring', 'other'])
export const invoice_status = pgEnum("invoice_status", ['DRAFT', 'PENDING', 'PAID', 'VOID', 'OVERDUE', 'draft', 'open', 'paid', 'uncollectible', 'void'])
export const message_status = pgEnum("message_status", ['READ', 'UNREAD'])
export const notification_type = pgEnum("notification_type", ['EMAIL', 'SMS'])
export const participant_type = pgEnum("participant_type", ['ADMIN', 'CLIENT_STAFF', 'CANDIDATE', 'SUPERADMIN', 'CLIENT'])
export const requisition_application_status = pgEnum("requisition_application_status", ['PENDING', 'APPROVED', 'DENIED'])
export const requisition_status_enum = pgEnum("requisition_status_enum", ['PENDING', 'OPEN', 'FILLED', 'UNFULFILLED', 'CANCELED'])
export const staff_roles = pgEnum("staff_roles", ['CLIENT_ADMIN', 'CLIENT_MANAGER', 'CLIENT_EMPLOYEE'])
export const support_ticket_status = pgEnum("support_ticket_status", ['NEW', 'PENDING', 'CLOSED'])
export const time_category_enum = pgEnum("time_category_enum", ['R', 'PTO', 'UPTO', 'H', 'OT', 'EXREIM', 'ME'])
export const timesheet_status = pgEnum("timesheet_status", ['PENDING', 'APPROVED', 'DISCREPANCY', 'REJECTED', 'VOID'])
export const user_roles = pgEnum("user_roles", ['SUPERADMIN', 'CLIENT', 'CLIENT_STAFF', 'CANDIDATE', 'ADMIN'])
export const workday_status_enum = pgEnum("workday_status_enum", ['PENDING', 'OPEN', 'FILLED', 'UNFULFILLED', 'CANCELED'])


export const sessions = pgTable("sessions", {
	id: text("id").primaryKey().notNull(),
	user_id: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" } ),
	expires_at: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
});

export const client_companies = pgTable("client_companies", {
	id: text("id").primaryKey().notNull(),
	client_id: text("client_id").notNull().references(() => client_profiles.id, { onDelete: "cascade" } ),
	created_at: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updated_at: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	company_name: text("company_name"),
	license_number: text("license_number"),
	company_logo: text("company_logo"),
	company_description: text("company_description"),
	base_location: text("base_location"),
	operating_hours: jsonb("operating_hours").default({"0":{"isClosed":false,"openTime":"00:00","timezone":"America/New_York","closeTime":"00:00"},"1":{"isClosed":false,"openTime":"00:00","timezone":"America/New_York","closeTime":"00:00"},"2":{"isClosed":false,"openTime":"00:00","timezone":"America/New_York","closeTime":"00:00"},"3":{"isClosed":false,"openTime":"00:00","timezone":"America/New_York","closeTime":"00:00"},"4":{"isClosed":false,"openTime":"00:00","timezone":"America/New_York","closeTime":"00:00"},"5":{"isClosed":false,"openTime":"00:00","timezone":"America/New_York","closeTime":"00:00"},"6":{"isClosed":false,"openTime":"00:00","timezone":"America/New_York","closeTime":"00:00"}}),
},
(table) => {
	return {
		client_companies_license_number_unique: unique("client_companies_license_number_unique").on(table.license_number),
	}
});

export const users = pgTable("users", {
	id: text("id").primaryKey().notNull(),
	provider: text("provider").default('email').notNull(),
	provider_id: text("provider_id").default('').notNull(),
	email: text("email").notNull(),
	first_name: text("first_name").notNull(),
	last_name: text("last_name").notNull(),
	role: text("role").default('CANDIDATE').notNull(),
	verified: boolean("verified").default(false).notNull(),
	receive_email: boolean("receive_email").default(true).notNull(),
	password: text("password"),
	token: text("token"),
	created_at: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	updated_at: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
	completed_onboarding: boolean("completed_onboarding").default(false),
	blacklisted: boolean("blacklisted").default(false),
	avatar_url: text("avatar_url"),
	onboarding_step: integer("onboarding_step").default(1),
	stripe_customer_id: text("stripe_customer_id"),
	timezone: text("timezone").default('America/New_York'),
},
(table) => {
	return {
		users_email_unique: unique("users_email_unique").on(table.email),
		users_token_unique: unique("users_token_unique").on(table.token),
		users_stripe_customer_id_unique: unique("users_stripe_customer_id_unique").on(table.stripe_customer_id),
	}
});

export const admin_notes = pgTable("admin_notes", {
	id: text("id").primaryKey().notNull(),
	created_at: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updated_at: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	title: text("title").notNull(),
	created_by_id: text("created_by_id").notNull().references(() => users.id, { onDelete: "cascade" } ),
	for_user_id: text("for_user_id").notNull().references(() => users.id, { onDelete: "cascade" } ),
	body: text("body").notNull(),
});

export const support_tickets = pgTable("support_tickets", {
	id: text("id").primaryKey().notNull(),
	created_at: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updated_at: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	closed_at: timestamp("closed_at", { withTimezone: true, mode: 'string' }),
	additional_notes: text("additional_notes"),
	closed_by_id: text("closed_by_id").references(() => users.id, { onDelete: "set null" } ),
	reported_by: text("reported_by").notNull().references(() => users.id, { onDelete: "cascade" } ),
	resolution_details: text("resolution_details"),
	steps_to_reproduce: text("steps_to_reproduce"),
	expected_result: text("expected_result"),
	status: support_ticket_status("status").default('NEW'),
	title: text("title").notNull(),
	actual_result: text("actual_result"),
});

export const candidate_profiles = pgTable("candidate_profiles", {
	id: text("id").primaryKey().notNull(),
	user_id: text("user_id").notNull().references(() => users.id),
	created_at: timestamp("created_at", { withTimezone: true, mode: 'string' }).default('2025-08-18 22:35:23.4+00').notNull(),
	updated_at: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default('2025-08-18 22:35:23.4+00').notNull(),
	address: text("address"),
	hourly_rate_min: smallint("hourly_rate_min").notNull(),
	hourly_rate_max: smallint("hourly_rate_max").notNull(),
	city: text("city"),
	state: text("state"),
	zipcode: text("zipcode"),
	employee_number: text("employee_number"),
	cell_phone: text("cell_phone"),
	citizenship: text("citizenship"),
	birthday: date("birthday"),
	avg_rating: smallint("avg_rating").default(0),
	region_id: text("region_id"),
	candidate_status: candidate_status("candidate_status").default('PENDING'),
	feature_me: boolean("feature_me").default(false),
	approved: boolean("approved").default(false),
	complete_address: text("complete_address"),
	lat: numeric("lat"),
	lon: numeric("lon"),
	// TODO: failed to parse database type 'geometry'
	geom: unknown("geom"),
},
(table) => {
	return {
		idx_candidate_profiles_geom: index("idx_candidate_profiles_geom").on(table.geom),
	}
});

export const candidate_ratings = pgTable("candidate_ratings", {
	id: text("id").primaryKey().notNull(),
	candidate_id: text("candidate_id").notNull().references(() => candidate_profiles.id, { onDelete: "cascade" } ),
	rated_by_id: text("rated_by_id").notNull().references(() => client_companies.id, { onDelete: "cascade" } ),
	created_at: timestamp("created_at", { withTimezone: true, mode: 'string' }).default('2025-08-18 22:35:23.4+00').notNull(),
	updated_at: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default('2025-08-18 22:35:23.4+00').notNull(),
	notes: text("notes"),
	rating: smallint("rating").notNull(),
});

export const client_profiles = pgTable("client_profiles", {
	id: text("id").primaryKey().notNull(),
	user_id: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" } ),
	created_at: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updated_at: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	birthday: date("birthday"),
});

export const client_ratings = pgTable("client_ratings", {
	id: text("id").primaryKey().notNull(),
	client_company_id: text("client_company_id").notNull().references(() => client_companies.id, { onDelete: "cascade" } ),
	rated_by_id: text("rated_by_id").notNull().references(() => candidate_profiles.id, { onDelete: "cascade" } ),
	created_at: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updated_at: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	notes: text("notes"),
	rating: smallint("rating").notNull(),
});

export const client_staff_locations = pgTable("client_staff_locations", {
	id: text("id").primaryKey().notNull(),
	created_at: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updated_at: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	company_id: text("company_id").notNull().references(() => client_companies.id, { onDelete: "cascade" } ),
	location_id: text("location_id").notNull().references(() => company_office_locations.id, { onDelete: "cascade" } ),
	is_primary_location: boolean("is_primary_location").default(false),
	staff_id: text("staff_id").notNull().references(() => client_staff.id, { onDelete: "cascade", onUpdate: "cascade" } ),
});

export const client_staff = pgTable("client_staff", {
	id: text("id").primaryKey().notNull(),
	created_at: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updated_at: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	user_id: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" } ),
	client_id: text("client_id").notNull().references(() => client_profiles.id, { onDelete: "cascade" } ),
	company_id: text("company_id").notNull().references(() => client_companies.id, { onDelete: "cascade" } ),
	staff_role: staff_roles("staff_role").default('CLIENT_EMPLOYEE'),
	birthday: date("birthday"),
});

export const company_office_locations = pgTable("company_office_locations", {
	id: text("id").primaryKey().notNull(),
	company_id: text("company_id").notNull().references(() => client_companies.id, { onDelete: "cascade" } ),
	created_at: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updated_at: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	location_name: text("location_name").notNull(),
	street_one: text("street_one"),
	street_two: text("street_two"),
	city: text("city"),
	state: text("state"),
	zipcode: text("zipcode"),
	company_phone: text("company_phone"),
	cell_phone: text("cell_phone"),
	operating_hours: jsonb("operating_hours").default({"0":{"isClosed":false,"openTime":"00:00","timezone":"America/New_York","closeTime":"00:00"},"1":{"isClosed":false,"openTime":"00:00","timezone":"America/New_York","closeTime":"00:00"},"2":{"isClosed":false,"openTime":"00:00","timezone":"America/New_York","closeTime":"00:00"},"3":{"isClosed":false,"openTime":"00:00","timezone":"America/New_York","closeTime":"00:00"},"4":{"isClosed":false,"openTime":"00:00","timezone":"America/New_York","closeTime":"00:00"},"5":{"isClosed":false,"openTime":"00:00","timezone":"America/New_York","closeTime":"00:00"},"6":{"isClosed":false,"openTime":"00:00","timezone":"America/New_York","closeTime":"00:00"}}),
	email: text("email"),
	region_id: text("region_id"),
	timezone: text("timezone").default('America/New_York').notNull(),
	complete_address: text("complete_address"),
	lat: numeric("lat"),
	lon: numeric("lon"),
	// TODO: failed to parse database type 'geometry'
	geom: unknown("geom"),
},
(table) => {
	return {
		idx_company_office_locations_geom: index("idx_company_office_locations_geom").on(table.geom),
	}
});

export const referral_keys = pgTable("referral_keys", {
	id: text("id").primaryKey().notNull(),
	created_at: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	updated_at: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
	blocked: boolean("blocked").default(false),
	referral_code: text("referral_code"),
});

export const experience_levels = pgTable("experience_levels", {
	id: text("id").primaryKey().notNull(),
	created_at: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	updated_at: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
	value: text("value").notNull(),
});

export const skill_categories = pgTable("skill_categories", {
	id: text("id").primaryKey().notNull(),
	created_at: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	updated_at: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
	name: text("name").notNull(),
});

export const skills = pgTable("skills", {
	id: text("id").primaryKey().notNull(),
	created_at: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	updated_at: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
	category_id: text("category_id").notNull().references(() => skill_categories.id, { onDelete: "cascade" } ),
	name: text("name").notNull(),
});

export const admin_note_comments = pgTable("admin_note_comments", {
	id: text("id").primaryKey().notNull(),
	created_at: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updated_at: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	admin_note_id: text("admin_note_id").notNull().references(() => admin_notes.id, { onDelete: "cascade" } ),
	created_by_id: text("created_by_id").notNull().references(() => users.id, { onDelete: "cascade" } ),
	body: text("body").notNull(),
});

export const disciplines = pgTable("disciplines", {
	id: text("id").primaryKey().notNull(),
	created_at: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	updated_at: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
	name: text("name").notNull(),
	abbreviation: text("abbreviation").notNull(),
});

export const client_subscriptions = pgTable("client_subscriptions", {
	id: text("id").primaryKey().notNull(),
	client_id: text("client_id").notNull().references(() => client_profiles.id, { onDelete: "cascade" } ),
	created_at: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updated_at: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	subscription_status: text("subscription_status"),
	stripe_customer_id: text("stripe_customer_id"),
	price_id: text("price_id"),
});

export const support_ticket_comments = pgTable("support_ticket_comments", {
	id: text("id").primaryKey().notNull(),
	created_at: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updated_at: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	support_ticket_id: text("support_ticket_id").notNull().references(() => support_tickets.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	from_id: text("from_id").notNull().references(() => users.id, { onDelete: "set null", onUpdate: "cascade" } ),
	comment_body: text("comment_body").notNull(),
});

export const staff_invite_locations = pgTable("staff_invite_locations", {
	token: text("token"),
	location_id: text("location_id").notNull(),
	is_primary: boolean("is_primary").default(true).notNull(),
},
(table) => {
	return {
		staff_invite_locations_token_unique: unique("staff_invite_locations_token_unique").on(table.token),
	}
});

export const user_invites = pgTable("user_invites", {
	id: text("id").primaryKey().notNull(),
	token: text("token"),
	email: text("email").notNull(),
	created_at: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updated_at: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	expires_at: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	referrer_role: user_roles("referrer_role").notNull(),
	referrer_id: text("referrer_id").notNull(),
	user_role: text("user_role").notNull(),
	company_id: text("company_id"),
	staff_role: text("staff_role"),
},
(table) => {
	return {
		user_invites_token_unique: unique("user_invites_token_unique").on(table.token),
	}
});

export const admin_config = pgTable("admin_config", {
	id: text("id").default('57b15de7-bed0-4526-9c26-7ae0949fa4ef').primaryKey().notNull(),
	created_at: timestamp("created_at", { withTimezone: true, mode: 'string' }).default('2025-08-18 22:35:23.403+00').notNull(),
	updated_at: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default('2025-08-18 22:35:23.403+00').notNull(),
	admin_payment_fee: smallint("admin_payment_fee").default(0).notNull(),
	admin_payment_fee_type: admin_payment_fee_type_enum("admin_payment_fee_type").default('PERCENTAGE').notNull(),
});

export const requisition_application = pgTable("requisition_application", {
	id: text("id").primaryKey().notNull(),
	created_at: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	updated_at: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
	requisition_id: integer("requisition_id").notNull().references(() => requisitions.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	candidate_id: text("candidate_id").notNull().references(() => candidate_profiles.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	application_status: requisition_application_status("application_status").default('PENDING'),
	archived: boolean("archived").default(false),
	archived_at: timestamp("archived_at", { mode: 'string' }),
	client_id: text("client_id").notNull().references(() => client_profiles.id),
});

export const requisitions = pgTable("requisitions", {
	id: serial("id").primaryKey().notNull(),
	created_at: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	updated_at: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
	status: requisition_status_enum("status").default('PENDING').notNull(),
	name: text("name").notNull(),
	client_id: text("client_id").notNull().references(() => client_companies.id),
	location_id: text("location_id").notNull().references(() => company_office_locations.id),
	discipline_id: text("discipline_id").notNull().references(() => disciplines.id),
	job_description: text("job_description").notNull(),
	special_instructions: text("special_instructions"),
	experience_level_id: text("experience_level_id").references(() => experience_levels.id),
	archived: boolean("archived").default(false),
	archived_at: timestamp("archived_at", { withTimezone: true, mode: 'string' }),
	hourly_rate: smallint("hourly_rate"),
	permanent_position: boolean("permanent_position").default(false),
	reference_timezone: text("reference_timezone").default('America/New_York').notNull(),
});

export const notification_templates = pgTable("notification_templates", {
	id: uuid("id").defaultRandom().primaryKey().notNull(),
	name: text("name").notNull(),
	description: text("description"),
	email_subject: text("email_subject"),
	required_sources: jsonb("required_sources").notNull(),
	created_at: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updated_at: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	type: notification_type("type").notNull(),
	created_by: text("created_by").notNull(),
	template: text("template").notNull(),
});

export const candidate_document_uploads = pgTable("candidate_document_uploads", {
	id: uuid("id").primaryKey().notNull(),
	created_at: timestamp("created_at", { withTimezone: true, mode: 'string' }).default('2025-08-18 22:35:23.4+00').notNull(),
	updated_at: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default('2025-08-18 22:35:23.4+00').notNull(),
	candidate_id: text("candidate_id").notNull().references(() => candidate_profiles.id),
	upload_url: text("upload_url").notNull(),
	expiry_date: timestamp("expiry_date", { withTimezone: true, mode: 'string' }),
	type: candidate_document_type("type").notNull(),
	filename: text("filename"),
});

export const in_app_notifications = pgTable("in_app_notifications", {
	id: uuid("id").primaryKey().notNull(),
	user_id: text("user_id").notNull().references(() => users.id),
	message: text("message").notNull(),
	status: in_app_notification_status("status").default('UNREAD').notNull(),
	resource_url: text("resource_url").notNull(),
	created_at: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updated_at: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	read_at: timestamp("read_at", { withTimezone: true, mode: 'string' }),
	batch_id: text("batch_id"),
});

export const action_history = pgTable("action_history", {
	id: text("id").primaryKey().notNull(),
	created_at: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updated_at: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	entity_id: text("entity_id").notNull(),
	entity_type: text("entity_type").notNull(),
	user_id: text("user_id").notNull().references(() => users.id),
	action: text("action").notNull(),
	changes: jsonb("changes"),
	metadata: jsonb("metadata").default({}),
});

export const recurrence_days = pgTable("recurrence_days", {
	id: text("id").primaryKey().notNull(),
	created_at: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	updated_at: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
	status: workday_status_enum("status").default('OPEN').notNull(),
	date: date("date").notNull(),
	day_start_time: timestamp("day_start_time", { withTimezone: true, mode: 'string' }).notNull(),
	day_end_time: timestamp("day_end_time", { withTimezone: true, mode: 'string' }).notNull(),
	lunch_start_time: timestamp("lunch_start_time", { withTimezone: true, mode: 'string' }).notNull(),
	lunch_end_time: timestamp("lunch_end_time", { withTimezone: true, mode: 'string' }).notNull(),
	requisition_id: integer("requisition_id").references(() => requisitions.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	archived: boolean("archived").default(false),
	archived_at: timestamp("archived_at", { mode: 'string' }),
});

export const geography_columns = pgTable("geography_columns", {
	// TODO: failed to parse database type 'name'
	f_table_catalog: unknown("f_table_catalog"),
	// TODO: failed to parse database type 'name'
	f_table_schema: unknown("f_table_schema"),
	// TODO: failed to parse database type 'name'
	f_table_name: unknown("f_table_name"),
	// TODO: failed to parse database type 'name'
	f_geography_column: unknown("f_geography_column"),
	coord_dimension: integer("coord_dimension"),
	srid: integer("srid"),
	type: text("type"),
});

export const spatial_ref_sys = pgTable("spatial_ref_sys", {
	srid: integer("srid").notNull(),
	auth_name: varchar("auth_name", { length: 256 }),
	auth_srid: integer("auth_srid"),
	srtext: varchar("srtext", { length: 2048 }),
	proj4text: varchar("proj4text", { length: 2048 }),
});

export const geometry_columns = pgTable("geometry_columns", {
	f_table_catalog: varchar("f_table_catalog", { length: 256 }),
	// TODO: failed to parse database type 'name'
	f_table_schema: unknown("f_table_schema"),
	// TODO: failed to parse database type 'name'
	f_table_name: unknown("f_table_name"),
	// TODO: failed to parse database type 'name'
	f_geometry_column: unknown("f_geometry_column"),
	coord_dimension: integer("coord_dimension"),
	srid: integer("srid"),
	type: varchar("type", { length: 30 }),
});

export const timesheets = pgTable("timesheets", {
	id: text("id").primaryKey().notNull(),
	created_at: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	updated_at: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
	associated_client_id: text("associated_client_id").notNull().references(() => client_profiles.id, { onDelete: "cascade" } ),
	associated_candidate_id: text("associated_candidate_id").notNull().references(() => candidate_profiles.id),
	validated: boolean("validated").default(false),
	total_hours_worked: numeric("total_hours_worked"),
	total_hours_billed: numeric("total_hours_billed"),
	awaiting_client_signature: boolean("awaiting_client_signature").default(true),
	candidate_rate_base: numeric("candidate_rate_base"),
	candidate_rate_overtime: numeric("candidate_rate_overtime"),
	requisition_id: integer("requisition_id").references(() => requisitions.id, { onDelete: "set null" } ),
	week_begin_date: date("week_begin_date").notNull(),
	hours_raw: json("hours_raw").default([]).notNull(),
	workday_id: text("workday_id").notNull().references(() => workdays.id),
	status: time("status").default('PENDING').notNull(),
},
(table) => {
	return {
		timesheet_candidate_idx: index("timesheet_candidate_idx").on(table.associated_candidate_id),
		timesheet_client_idx: index("timesheet_client_idx").on(table.associated_client_id),
		timesheet_requisition_idx: index("timesheet_requisition_idx").on(table.requisition_id),
		timesheet_week_begin_idx: index("timesheet_week_begin_idx").on(table.week_begin_date),
	}
});

export const workdays = pgTable("workdays", {
	id: text("id").primaryKey().notNull(),
	created_at: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	updated_at: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
	candidate_id: text("candidate_id").notNull().references(() => candidate_profiles.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	requisition_id: integer("requisition_id").notNull().references(() => requisitions.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	recurrence_day_id: text("recurrence_day_id").references(() => recurrence_days.id, { onDelete: "cascade", onUpdate: "cascade" } ),
});

export const invoices = pgTable("invoices", {
	id: uuid("id").defaultRandom().primaryKey().notNull(),
	created_at: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updated_at: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	stripe_invoice_id: text("stripe_invoice_id"),
	stripe_customer_id: text("stripe_customer_id"),
	stripe_status: text("stripe_status"),
	stripe_pdf_url: text("stripe_pdf_url"),
	stripe_hosted_url: text("stripe_hosted_url"),
	invoice_number: text("invoice_number").notNull(),
	status: invoice_status("status").default('draft').notNull(),
	source_type: invoice_source_type("source_type").default('manual').notNull(),
	currency: text("currency").default('usd').notNull(),
	amount_due: numeric("amount_due", { precision: 10, scale:  2 }).default('0').notNull(),
	amount_paid: numeric("amount_paid", { precision: 10, scale:  2 }).default('0').notNull(),
	amount_remaining: numeric("amount_remaining", { precision: 10, scale:  2 }).default('0').notNull(),
	subtotal: numeric("subtotal", { precision: 10, scale:  2 }).default('0').notNull(),
	total: numeric("total", { precision: 10, scale:  2 }).default('0').notNull(),
	tax_amount: numeric("tax_amount", { precision: 10, scale:  2 }).default('0'),
	due_date: timestamp("due_date", { withTimezone: true, mode: 'string' }),
	period_start: timestamp("period_start", { withTimezone: true, mode: 'string' }),
	period_end: timestamp("period_end", { withTimezone: true, mode: 'string' }),
	paid_at: timestamp("paid_at", { withTimezone: true, mode: 'string' }),
	voided_at: timestamp("voided_at", { withTimezone: true, mode: 'string' }),
	client_id: text("client_id").notNull().references(() => client_profiles.id, { onDelete: "restrict" } ),
	customer_email: text("customer_email"),
	customer_name: text("customer_name"),
	candidate_id: text("candidate_id").references(() => candidate_profiles.id, { onDelete: "set null" } ),
	requisition_id: integer("requisition_id").references(() => requisitions.id, { onDelete: "set null" } ),
	timesheet_id: text("timesheet_id").references(() => timesheets.id, { onDelete: "set null" } ),
	billing_reason: text("billing_reason"),
	collection_method: text("collection_method").default('send_invoice'),
	description: text("description"),
	footer: text("footer"),
	attempt_count: integer("attempt_count").default(0),
	attempted: boolean("attempted").default(false),
	livemode: boolean("livemode").default(false),
	line_items: jsonb("line_items").default([]),
	metadata: jsonb("metadata").default({}),
	custom_fields: jsonb("custom_fields"),
	discounts: jsonb("discounts").default([]),
	payment_method_types: jsonb("payment_method_types"),
	default_payment_method: text("default_payment_method"),
},
(table) => {
	return {
		invoice_status_idx: index("invoice_status_idx").on(table.status),
		invoice_source_type_idx: index("invoice_source_type_idx").on(table.source_type),
		invoice_client_idx: index("invoice_client_idx").on(table.client_id),
		invoice_due_date_idx: index("invoice_due_date_idx").on(table.due_date),
		invoice_stripe_invoice_idx: index("invoice_stripe_invoice_idx").on(table.stripe_invoice_id),
		invoice_stripe_customer_idx: index("invoice_stripe_customer_idx").on(table.stripe_customer_id),
		invoice_candidate_idx: index("invoice_candidate_idx").on(table.candidate_id),
		invoice_requisition_idx: index("invoice_requisition_idx").on(table.requisition_id),
		invoice_timesheet_idx: index("invoice_timesheet_idx").on(table.timesheet_id),
		invoice_status_due_date_idx: index("invoice_status_due_date_idx").on(table.status, table.due_date),
		invoice_client_status_idx: index("invoice_client_status_idx").on(table.status, table.client_id),
		invoice_source_type_status_idx: index("invoice_source_type_status_idx").on(table.status, table.source_type),
		invoices_stripe_invoice_id_unique: unique("invoices_stripe_invoice_id_unique").on(table.stripe_invoice_id),
		invoices_invoice_number_unique: unique("invoices_invoice_number_unique").on(table.invoice_number),
	}
});

export const conversations = pgTable("conversations", {
	id: text("id").primaryKey().notNull(),
	created_at: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updated_at: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	last_message_id: integer("last_message_id"),
	type: conversation_type("type").notNull(),
	application_id: text("application_id").references(() => requisition_application.id, { onDelete: "cascade" } ),
	is_active: boolean("is_active").default(true).notNull(),
},
(table) => {
	return {
		conversation_type_idx: index("conversation_type_idx").on(table.type),
		conversation_application_idx: index("conversation_application_idx").on(table.application_id),
		conversation_updated_at_idx: index("conversation_updated_at_idx").on(table.updated_at),
	}
});

export const messages = pgTable("messages", {
	id: serial("id").primaryKey().notNull(),
	created_at: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	body: text("body").notNull(),
	sender_id: text("sender_id").notNull().references(() => users.id),
	status: message_status("status").default('UNREAD'),
	conversation_id: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" } ),
	edited_at: timestamp("edited_at", { withTimezone: true, mode: 'string' }),
	is_system_message: boolean("is_system_message").default(false),
},
(table) => {
	return {
		message_sender_idx: index("message_sender_idx").on(table.sender_id),
		message_conversation_timestamp_idx: index("message_conversation_timestamp_idx").on(table.created_at, table.conversation_id),
	}
});

export const candidate_blacklists = pgTable("candidate_blacklists", {
	candidate_id: text("candidate_id").notNull().references(() => candidate_profiles.id, { onDelete: "cascade" } ),
	company_id: text("company_id").notNull().references(() => client_companies.id, { onDelete: "cascade" } ),
	created_at: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		candidate_blacklists_candidate_id_company_id_pk: primaryKey({ columns: [table.candidate_id, table.company_id], name: "candidate_blacklists_candidate_id_company_id_pk"}),
	}
});

export const candidate_saved_requisitions = pgTable("candidate_saved_requisitions", {
	candidate_id: text("candidate_id").notNull().references(() => candidate_profiles.id, { onDelete: "cascade" } ),
	requisition_id: integer("requisition_id").notNull().references(() => requisitions.id, { onDelete: "cascade" } ),
	saved_at: timestamp("saved_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		candidate_saved_requisitions_candidate_id_requisition_id_pk: primaryKey({ columns: [table.candidate_id, table.requisition_id], name: "candidate_saved_requisitions_candidate_id_requisition_id_pk"}),
	}
});

export const candidate_discipline_experience = pgTable("candidate_discipline_experience", {
	created_at: timestamp("created_at", { withTimezone: true, mode: 'string' }).default('2025-08-18 22:35:23.4+00').notNull(),
	updated_at: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default('2025-08-18 22:35:23.4+00').notNull(),
	candidate_id: text("candidate_id").notNull().references(() => candidate_profiles.id, { onDelete: "cascade" } ),
	experience_level_id: text("experience_level_id").notNull().references(() => experience_levels.id, { onDelete: "cascade" } ),
	discipline_id: text("discipline_id").notNull().references(() => disciplines.id, { onDelete: "cascade" } ),
},
(table) => {
	return {
		candidate_discipline_experience_candidate_id_discipline_id_pk: primaryKey({ columns: [table.candidate_id, table.discipline_id], name: "candidate_discipline_experience_candidate_id_discipline_id_pk"}),
	}
});

export const conversation_participants = pgTable("conversation_participants", {
	user_id: text("user_id").notNull().references(() => users.id),
	conversation_id: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" } ),
	joined_at: timestamp("joined_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	participant_type: user_roles("participant_type").notNull(),
	left_at: timestamp("left_at", { withTimezone: true, mode: 'string' }),
	is_active: boolean("is_active").default(true).notNull(),
	last_read_message_id: integer("last_read_message_id").references(() => messages.id),
},
(table) => {
	return {
		participant_active_conversations_idx: index("participant_active_conversations_idx").on(table.user_id),
		participant_user_type_idx: index("participant_user_type_idx").on(table.user_id, table.participant_type),
		conversation_participants_conversation_id_user_id_pk: primaryKey({ columns: [table.user_id, table.conversation_id], name: "conversation_participants_conversation_id_user_id_pk"}),
	}
});