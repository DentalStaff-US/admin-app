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
	index
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
			.default(new Date()),
		updatedAt: timestamp('updated_at', {
			withTimezone: true,
			mode: 'date'
		})
			.notNull()
			.default(new Date()),
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
		.default(new Date()),
	updatedAt: timestamp('updated_at', {
		withTimezone: true,
		mode: 'date'
	})
		.notNull()
		.default(new Date()),
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
			.default(new Date()),
		updatedAt: timestamp('updated_at', {
			withTimezone: true,
			mode: 'date'
		})
			.notNull()
			.default(new Date()),
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

export const candidateDocumentUploadsTable = pgTable('candidate_document_uploads', {
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
	candidateId: text('candidate_id')
		.references(() => candidateProfileTable.id, { onDelete: 'cascade' })
		.notNull(),
	uploadUrl: text('upload_url').notNull(),
	expiryDate: timestamp('expiry_date', {
		withTimezone: true,
		mode: 'date'
	}),
	type: candidateDocumentTypeEnum('type').notNull(),
	filename: text('filename'),
	adminOnly: boolean('admin_only').default(false)
});

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
export type CandidateDocumentUploads = typeof candidateDocumentUploadsTable.$inferInsert;
export type CandidateDocumentUploadsSelect = typeof candidateDocumentUploadsTable.$inferSelect;
export type UpdateCandidateDocumentUploads = Partial<
	typeof candidateDocumentUploadsTable.$inferInsert
>;
