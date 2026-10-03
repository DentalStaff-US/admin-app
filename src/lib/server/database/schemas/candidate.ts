import {
	pgTable,
	text,
	timestamp,
	smallint,
	date,
	pgEnum,
	boolean,
	primaryKey,
	uuid,
	decimal,
	customType,
	integer,
	index,
	uniqueIndex
} from 'drizzle-orm/pg-core';
import { userTable } from './auth';
import { disciplineTable, experienceLevelTable } from './skill';
import { clientCompanyTable } from './client';
import { sql } from 'drizzle-orm';

export const candidateStatusEnum = pgEnum('candidate_status', [
	'INACTIVE',
	'PENDING',
	'ACTIVE',
	'DENIED'
]);
const geometry = customType<{ data: string; notNull: false; default: false }>({
	dataType() {
		return 'geometry(POINT, 4326)';
	}
});
export const candidateProfileTable = pgTable(
	'candidate_profiles',
	{
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
		address: text('address'),
		hourlyRateMin: smallint('hourly_rate_min'),
		hourlyRateMax: smallint('hourly_rate_max'),
		status: candidateStatusEnum('candidate_status').default('PENDING'),
		city: text('city'),
		state: text('state'),
		zipcode: text('zipcode'),
		employeeNumber: text('employee_number'),
		cellPhone: text('cell_phone'),
		citizenship: text('citizenship'),
		birthday: date('birthday'),
		avgRating: smallint('avg_rating').default(0),
		featureMe: boolean('feature_me').default(false),
		approved: boolean('approved').default(false),
		completeAddress: text('complete_address'),
		lat: decimal('lat'),
		lon: decimal('lon'),
		geom: geometry('geom'),
		puid: integer('puid')
			.notNull()
			.unique()
			.default(sql`nextval('puid_seq')`),
		ssnLast4: text('ssn_last4'),
		workersCompCode: text('workers_comp_code'),
		// Last time a mass notification reached this candidate. Null = never
		// contacted. Used by the "stale / not contacted in 30 days" segment filter.
		lastContactedAt: timestamp('last_contacted_at', { withTimezone: true, mode: 'date' })
	},
	(table) => ({
		// Back the city/state/zip filters on the professionals index. City is
		// indexed lower-case to match the case-insensitive facet lookups.
		cityIdx: index('candidate_profiles_city_idx').on(sql`lower(${table.city})`),
		stateIdx: index('candidate_profiles_state_idx').on(table.state),
		zipcodeIdx: index('candidate_profiles_zipcode_idx').on(table.zipcode)
	})
);

export const candidateRatingTable = pgTable('candidate_ratings', {
	id: text('id').notNull().primaryKey(),
	candidateId: text('candidate_id')
		.notNull()
		.references(() => candidateProfileTable.id, { onDelete: 'cascade' }),
	ratedById: text('rated_by_id')
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
	notes: text('notes'),
	rating: smallint('rating').notNull()
});

export const candidateBlacklistTable = pgTable(
	'candidate_blacklists',
	{
		candidateId: text('candidate_id')
			.notNull()
			.references(() => candidateProfileTable.id, { onDelete: 'cascade' }),
		companyId: text('company_id')
			.notNull()
			.references(() => clientCompanyTable.id, { onDelete: 'cascade' }),
		createdAt: timestamp('created_at', {
			withTimezone: true,
			mode: 'date'
		})
			.notNull()
			.defaultNow()
	},
	(table) => {
		return {
			pk: primaryKey({ columns: [table.candidateId, table.companyId] })
		};
	}
);

export const candidateDisciplineExperienceTable = pgTable(
	'candidate_discipline_experience',
	{
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
		candidateId: text('candidate_id')
			.notNull()
			.references(() => candidateProfileTable.id, { onDelete: 'cascade' }),
		experienceLevelId: text('experience_level_id')
			.notNull()
			.references(() => experienceLevelTable.id, { onDelete: 'cascade' }),
		disciplineId: text('discipline_id')
			.notNull()
			.references(() => disciplineTable.id, { onDelete: 'cascade' }),
		preferredHourlyMin: smallint('preferred_hourly_min').notNull().default(0),
		preferredHourlyMax: smallint('preferred_hourly_max').notNull().default(0)
	},
	(t) => ({ pk: primaryKey({ columns: [t.candidateId, t.disciplineId] }) })
);

export const candidateDocumentTypeEnum = pgEnum('candidate_document_type', [
	'RESUME',
	'LICENSE',
	'CERTIFICATE',
	'AGREEMENT',
	'OTHER'
]);

export const candidateDocumentUploadsTable = pgTable(
	'candidate_document_uploads',
	{
		id: uuid('id').notNull().primaryKey(),
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
		candidateId: text('candidate_id')
			.references(() => candidateProfileTable.id, { onDelete: 'cascade' })
			.notNull(),
		uploadUrl: text('upload_url').notNull(),
		/**
		 * Credential expiration as a CALENDAR date ('YYYY-MM-DD'), not an instant.
		 *
		 * Was `timestamptz` before certification tracking existed, when nothing ever
		 * wrote to it. An expiry is a date — storing an instant meant every read had to
		 * pin the timezone (`AT TIME ZONE 'UTC'`) or the same row would resolve a day
		 * earlier for anyone west of UTC, and every gate decision with it.
		 */
		expiryDate: date('expiry_date'),
		type: candidateDocumentTypeEnum('type').notNull(),
		filename: text('filename'),
		adminOnly: boolean('admin_only').default(false),
		// Admin-applied freeze on a single document. Independent of the
		// approved-candidate freeze: an admin can pin one document (a signed
		// agreement, a verified license) while the rest stay editable.
		// See `assertCandidateDocumentEditable`.
		locked: boolean('locked').notNull().default(false),
		// The Experience & Rates entry this credential evidences. Together with this
		// row's own `candidateId` it names a candidate_discipline_experience row
		// (whose PK is (candidate_id, discipline_id)), so a credential can only be
		// attached to a discipline the professional actually holds — enforced on
		// write, since a composite FK cannot ON DELETE SET NULL just this column.
		//
		// A LICENSE/CERTIFICATE linked here WITH an expiry_date is what makes a
		// discipline expiration-tracked for this professional. There is no separate
		// "requires cert" flag or second copy of the date: the requirement lives on
		// disciplines.requires_certification and the date lives here.
		// See src/lib/server/certifications/.
		disciplineId: text('discipline_id').references(() => disciplineTable.id, {
			onDelete: 'set null'
		})
	},
	(t) => ({
		// Backs the per-discipline gate subquery, the daily expiry scan and the
		// documents lists. This table previously had no indexes at all.
		credentialIdx: index('candidate_document_uploads_credential_idx').on(
			t.candidateId,
			t.disciplineId,
			t.expiryDate
		),
		expiryIdx: index('candidate_document_uploads_expiry_idx').on(t.expiryDate)
	})
);

/**
 * One row per certification reminder actually sent, and the mechanism that makes
 * the 60/30/14/7/day-of/day-after series exactly-once.
 *
 * `expiresOn` is the effective expiry (MAX across the discipline's linked
 * credentials) AT SEND TIME, and it is part of the unique key on purpose: when a
 * professional uploads a renewed certificate the effective expiry changes, so
 * every (candidate, discipline, newExpiry, stage) tuple is unseen and a fresh
 * series starts with no reset code, no deletes and no cleanup job. Old rows stay
 * as the record of what we told them.
 *
 * DO NOT "simplify" the unique index to (candidate, discipline, stage) — that
 * silently breaks renewal, because every stage would already look sent.
 *
 * Keyed on the credential STATE rather than a document id so that renewing with a
 * different file does not resend a stage already sent for the same date.
 */
export const candidateCertRemindersTable = pgTable(
	'candidate_cert_reminders',
	{
		id: uuid('id').notNull().defaultRandom().primaryKey(),
		candidateId: text('candidate_id')
			.notNull()
			.references(() => candidateProfileTable.id, { onDelete: 'cascade' }),
		disciplineId: text('discipline_id')
			.notNull()
			.references(() => disciplineTable.id, { onDelete: 'cascade' }),
		expiresOn: date('expires_on').notNull(),
		/** 'D60' | 'D30' | 'D14' | 'D7' | 'D0' | 'EXPIRED' — see certReminders.ts. */
		stage: text('stage').notNull(),
		/**
		 * Channels attempted: 'EMAIL' | 'SMS' | 'EMAIL+SMS'. Evidence for support,
		 * never read by the dedupe. "Attempted" rather than "delivered" because
		 * `dispatch()` in transactional.ts swallows per-channel results by design.
		 */
		channels: text('channels').notNull().default(''),
		sentAt: timestamp('sent_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
	},
	(t) => ({
		uniqueStage: uniqueIndex('candidate_cert_reminders_unique_stage_idx').on(
			t.candidateId,
			t.disciplineId,
			t.expiresOn,
			t.stage
		)
	})
);

export type CandidateProfile = typeof candidateProfileTable.$inferInsert;
export type CandidateProfileSelect = typeof candidateProfileTable.$inferSelect;
export type UpdateCandidateProfile = Partial<typeof candidateProfileTable.$inferInsert>;

export type CandidateRating = typeof candidateRatingTable.$inferInsert;
export type UpdateCandidateRating = Partial<typeof candidateRatingTable.$inferInsert>;
export type CandidateRatingSelect = typeof candidateRatingTable.$inferSelect;

export type CandidateBlacklist = typeof candidateBlacklistTable.$inferInsert;
export type CandidateBlacklistSelect = typeof candidateBlacklistTable.$inferSelect;
export type UpdateCandidateBlacklist = Partial<typeof candidateBlacklistTable.$inferInsert>;

export type CandidateDisciplineExperience = typeof candidateDisciplineExperienceTable.$inferInsert;
export type CandidateDisciplineExperienceSelect =
	typeof candidateDisciplineExperienceTable.$inferSelect;
export type UpdateCandidateDisciplineExperience = Partial<
	typeof candidateDisciplineExperienceTable.$inferInsert
>;
export type CandidateCertReminder = typeof candidateCertRemindersTable.$inferInsert;
export type CandidateCertReminderSelect = typeof candidateCertRemindersTable.$inferSelect;

export type CandidateDocumentUploads = typeof candidateDocumentUploadsTable.$inferInsert;
export type CandidateDocumentUploadsSelect = typeof candidateDocumentUploadsTable.$inferSelect;
export type UpdateCandidateDocumentUploads = Partial<
	typeof candidateDocumentUploadsTable.$inferInsert
>;
