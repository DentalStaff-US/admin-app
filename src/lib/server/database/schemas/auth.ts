import { pgTable, text, timestamp, boolean, pgEnum, integer } from 'drizzle-orm/pg-core';

export const userRolesEnum = pgEnum('user_roles', [
	'SUPERADMIN',
	'ADMIN',
	'CLIENT',
	'CLIENT_STAFF',
	'CANDIDATE'
]);

export const userTable = pgTable('users', {
	id: text('id').notNull().primaryKey(),
	provider: text('provider').notNull().default('email'),
	providerId: text('provider_id').notNull().default(''),
	email: text('email').notNull().unique(),
	// Better Auth core requires a `name` field; we keep first_name/last_name as the
	// app-facing split and populate `name` as "first last" on signup.
	name: text('name'),
	firstName: text('first_name').notNull(),
	lastName: text('last_name').notNull(),
	avatarUrl: text('avatar_url'),
	role: text('role').notNull().default('CANDIDATE'),
	verified: boolean('verified').notNull().default(false),
	receiveEmail: boolean('receive_email').notNull().default(true),
		// Mirror of receiveEmail for SMS. Flipped to false when a user replies STOP
		// to a Twilio message (see the SMS webhook) and honored by mass-notification
		// sends. Defaults true — existing platform data is implied opt-in.
		receiveSms: boolean('receive_sms').notNull().default(true),
	password: text('password'),
	token: text('token').unique(),
	createdAt: timestamp('created_at', {
		withTimezone: true,
		mode: 'date'
	}).notNull(),
	updatedAt: timestamp('updated_at', {
		withTimezone: true,
		mode: 'date'
	}).notNull(),
	completedOnboarding: boolean('completed_onboarding').default(false),
	onboardingStep: integer('onboarding_step').default(1),
	blacklisted: boolean('blacklisted').default(false),
	stripeCustomerId: text('stripe_customer_id').unique(),
	timezone: text('timezone').default('America/New_York'),
	// Better Auth admin plugin fields
	banned: boolean('banned').default(false),
	banReason: text('ban_reason'),
	banExpires: timestamp('ban_expires', { withTimezone: true, mode: 'date' }),
	// Better Auth two-factor plugin flag
	twoFactorEnabled: boolean('two_factor_enabled').default(false)
});

export const sessionTable = pgTable('sessions', {
	id: text('id').notNull().primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => userTable.id, { onDelete: 'cascade' }),
	expiresAt: timestamp('expires_at', {
		withTimezone: true,
		mode: 'date'
	}).notNull(),
	// Better Auth session fields (Lucia only had id/user_id/expires_at)
	token: text('token').unique(),
	ipAddress: text('ip_address'),
	userAgent: text('user_agent'),
	// admin plugin: set when an admin is impersonating this user
	impersonatedBy: text('impersonated_by'),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
});

// ──────────────────────────────────────────────────────────────────────────
// Better Auth tables (new). `account` holds credential + future social logins,
// `verification` backs email-verify / password-reset / OTP, `two_factor` stores
// TOTP secrets + backup codes. All keyed by Better Auth model name in auth.ts.
// ──────────────────────────────────────────────────────────────────────────

export const accountTable = pgTable('account', {
	id: text('id').notNull().primaryKey(),
	accountId: text('account_id').notNull(),
	providerId: text('provider_id').notNull(),
	userId: text('user_id')
		.notNull()
		.references(() => userTable.id, { onDelete: 'cascade' }),
	accessToken: text('access_token'),
	refreshToken: text('refresh_token'),
	idToken: text('id_token'),
	accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true, mode: 'date' }),
	refreshTokenExpiresAt: timestamp('refresh_token_expires_at', {
		withTimezone: true,
		mode: 'date'
	}),
	scope: text('scope'),
	password: text('password'),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
});

export const verificationTable = pgTable('verification', {
	id: text('id').notNull().primaryKey(),
	identifier: text('identifier').notNull(),
	value: text('value').notNull(),
	expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow()
});

export const twoFactorTable = pgTable('two_factor', {
	id: text('id').notNull().primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => userTable.id, { onDelete: 'cascade' }),
	secret: text('secret'),
	backupCodes: text('backup_codes')
});

export const userInviteTable = pgTable('user_invites', {
	id: text('id').notNull().primaryKey(),
	token: text('token').unique(),
	email: text('email').notNull(),
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
	expiresAt: timestamp('expires_at', {
		withTimezone: true,
		mode: 'date'
	}).notNull(),
	referrerRole: userRolesEnum('referrer_role').notNull(),
	referrerId: text('referrer_id').notNull(),
	invitedRole: text('user_role').notNull(),
	staffRole: text('staff_role'),
	companyId: text('company_id')
});

export const companyStaffInviteLocations = pgTable('staff_invite_locations', {
	token: text('token').unique(),
	locationId: text('location_id').notNull(),
	isPrimary: boolean('is_primary').notNull().default(true)
});

export type User = typeof userTable.$inferSelect;
export type NewUser = typeof userTable.$inferInsert;
export type UpdateUser = Partial<typeof userTable.$inferInsert>;
export type Session = typeof sessionTable.$inferSelect;
export type NewSession = typeof sessionTable.$inferInsert;
export type Account = typeof accountTable.$inferSelect;
export type NewAccount = typeof accountTable.$inferInsert;
export type Verification = typeof verificationTable.$inferSelect;
export type TwoFactor = typeof twoFactorTable.$inferSelect;
export type NewUserInvite = typeof userInviteTable.$inferInsert;
export type NewStaffLocationInvite = typeof companyStaffInviteLocations.$inferInsert;
