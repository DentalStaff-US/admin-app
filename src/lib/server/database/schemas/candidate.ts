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
	uniqueIndex,
	check
} from 'drizzle-orm/pg-core';
import { userTable } from './auth';
import { disciplineTable, experienceLevelTable } from './skill';
import { clientCompanyTable } from './client';
import { sql } from 'drizzle-orm';

/**
 * What KIND of work this professional wants to be shown.
 *
 * Maps one-to-one onto `requisitions.permanent_position`, which already splits the
 * platform's two listing paths: the temp shift board (recurrence days) and the
 * permanent openings board.
 */
export const candidateWorkPreferenceEnum = pgEnum('candidate_work_preference', [
	'TEMP',
	'PERMANENT',
	'BOTH'
]);

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
		lastContactedAt: timestamp('last_contacted_at', { withTimezone: true, mode: 'date' }),
		/**
		 * Weekly availability pattern: the days this professional IS available, as
		 * Postgres DOW integers (0 = Sunday … 6 = Saturday) — the same numbering as
		 * JS `Date.prototype.getDay()`, as `EXTRACT(DOW FROM date)`, and as the keys
		 * of client.ts's OperatingHours. One weekday vocabulary, platform-wide.
		 *
		 * NULL means NEVER SET, and NEVER SET means AVAILABLE ALL SEVEN DAYS. That is
		 * the whole point of the column being nullable: inaction must never cost
		 * someone work, and every professional who existed before this column has NULL.
		 *
		 * DO NOT give this a default and DO NOT make it NOT NULL. Backfilling
		 * ARRAY[0,1,2,3,4,5,6] looks equivalent and is not: it destroys the ability to
		 * tell "never set" from "deliberately set to all seven", which the candidate
		 * UI needs ("you haven't set this yet") and which any future
		 * set-your-availability campaign needs to pick its audience.
		 *
		 * An EMPTY array is forbidden by the CHECK below, because `inArray(expr, [])`
		 * renders as FALSE in Drizzle — an empty array here would hide every shift from
		 * that professional with no visible cause. "Available no days" is not a state
		 * this product has; someone who wants to stop working goes INACTIVE.
		 */
		availableDays: integer('available_days').array().$type<number[]>(),
		/** When the pattern was last saved. Null while availableDays is NULL. */
		availableDaysUpdatedAt: timestamp('available_days_updated_at', {
			withTimezone: true,
			mode: 'date'
		}),
		/**
		 * Which door wrote the value. action_history has the full history; this is for
		 * the badge on both UIs ("set by DTSS staff"), which needs the current owner
		 * without a join. Resolved from the app the write came through, not from the
		 * actor's role — a superadmin impersonating a professional through the
		 * candidate app writes CANDIDATE, and the ledger records who really did it.
		 */
		availableDaysSource: text('available_days_source').$type<'CANDIDATE' | 'ADMIN'>(),
		/**
		 * Temp work, permanent work, or both.
		 *
		 * NULL means NEVER SET, and NEVER SET means BOTH — the same rule as
		 * available_days above, for the same reason: a professional who has not
		 * answered must keep seeing everything they qualify for. Nullable with NO
		 * DEFAULT so that "never answered" stays distinguishable from "deliberately
		 * chose both"; the UI needs that to say "you haven't told us yet", and so
		 * would any future nudge asking them to.
		 *
		 * Read it through workPreference.ts rather than comparing the column
		 * directly — `pref === 'BOTH'` silently excludes every professional who has
		 * never set it, which is most of them.
		 */
		workPreference: candidateWorkPreferenceEnum('work_preference'),
		/** When it was last saved. Null while workPreference is NULL. */
		workPreferenceUpdatedAt: timestamp('work_preference_updated_at', {
			withTimezone: true,
			mode: 'date'
		})
	},
	(table) => ({
		// Back the city/state/zip filters on the professionals index. City is
		// indexed lower-case to match the case-insensitive facet lookups.
		cityIdx: index('candidate_profiles_city_idx').on(sql`lower(${table.city})`),
		stateIdx: index('candidate_profiles_state_idx').on(table.state),
		zipcodeIdx: index('candidate_profiles_zipcode_idx').on(table.zipcode),
		// Subqueries are illegal in a CHECK, so duplicate-day rejection lives in
		// normalizeAvailableDays(). Duplicates are harmless to the predicate anyway
		// (`3 = ANY(ARRAY[3,3])`); an EMPTY array is not, which is what this guards.
		availableDaysSane: check(
			'candidate_profiles_available_days_check',
			sql`${table.availableDays} IS NULL OR (
				array_length(${table.availableDays}, 1) BETWEEN 1 AND 7
				AND ${table.availableDays} <@ ARRAY[0,1,2,3,4,5,6]
				AND array_position(${table.availableDays}, NULL) IS NULL
			)`
		)
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

/**
 * Dates this professional has marked themselves NOT available. The absence of a
 * row means available — the same default-permissive rule as a NULL
 * candidate_profiles.available_days.
 *
 * One row per blocked date rather than a jsonb array on the profile, because:
 *   - cardinality is unbounded and grows with every vacation
 *   - each date carries its own note, source and author
 *   - the gate wants `NOT EXISTS (... AND date = recurrence_days.date)`, which is
 *     exactly the shape of the booked-dates rule it sits beside
 *   - an array would be read-modify-written on every calendar tap, so two tabs
 *     would lose each other's edits, and there would be nothing to index
 *
 * This table records intent ("I said no"); `workdays` records commitment ("I'm
 * working"). They are deliberately separate — claiming a shift never writes a row
 * here, and blacking out a date never touches a workday.
 */
export const candidateUnavailableDateTable = pgTable(
	'candidate_unavailable_dates',
	{
		candidateId: text('candidate_id')
			.notNull()
			.references(() => candidateProfileTable.id, { onDelete: 'cascade' }),
		/**
		 * A BARE calendar date, deliberately not a timestamp. It is compared by
		 * equality against recurrence_days.date, which is also a bare date — so "is
		 * this pro blocked on this shift's day" contains no timezone anywhere.
		 * Storing an instant here would reintroduce exactly the drift that bare
		 * date columns exist to avoid.
		 */
		date: date('date').notNull(),
		/** The professional's own words ("vacation"). Never shown to clients. */
		note: text('note'),
		/** Which door wrote the row — see available_days_source above. */
		source: text('source').$type<'CANDIDATE' | 'ADMIN'>().notNull().default('CANDIDATE'),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow(),
		/**
		 * Nullable + SET NULL: a row must survive the deletion of the admin who
		 * entered it, and imported/system rows have no actor at all — a NOT NULL FK
		 * would force a fake user into the data.
		 */
		createdByUserId: text('created_by_user_id').references(() => userTable.id, {
			onDelete: 'set null'
		})
	},
	(table) => ({
		/**
		 * (candidate, date) is the natural key AND the exact shape of the gate
		 * lookup, so the PK index IS the gate index. A composite PK rather than a
		 * surrogate id (mirroring candidate_blacklists): nothing else could point at
		 * a single blocked date, and a surrogate would mean a second index with no
		 * reader. It also makes the writer safely idempotent via onConflictDoUpdate,
		 * which is what keeps two concurrent saves from erroring.
		 */
		pk: primaryKey({ columns: [table.candidateId, table.date] }),
		/** Backs cross-candidate date scans (admin reports, any future prune). */
		dateIdx: index('candidate_unavailable_dates_date_idx').on(table.date)
	})
);

export type CandidateUnavailableDate = typeof candidateUnavailableDateTable.$inferInsert;
export type CandidateUnavailableDateSelect = typeof candidateUnavailableDateTable.$inferSelect;

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
		preferredHourlyMax: smallint('preferred_hourly_max').notNull().default(0),
		/**
		 * Does THIS professional's jurisdiction require a certification for this
		 * discipline? Self-declared — they know their state, and it varies.
		 *
		 * Once true, only an admin may set it false: otherwise a professional whose
		 * certification has lapsed clears their own gate in two clicks. Enforced in
		 * setDisciplineCertification, not by a constraint, because it is a permission
		 * rule and the database has no notion of the actor.
		 */
		requiresCert: boolean('requires_cert').notNull().default(false),
		/**
		 * Authoritative expiry for that certification. CERTIFICATE documents linked to
		 * the same discipline are supporting evidence; THIS is what the gate reads.
		 *
		 * Null while requiresCert is true = declared but not yet dated. That warns and
		 * is surfaced in the admin digest; it never blocks. No CHECK constraint pairing
		 * the two, because that state is reachable by import and support edits and
		 * should surface as a chaseable row rather than a 500.
		 *
		 * NOT writable by the bulk discipline writer — see replaceCandidateDisciplines.
		 */
		certExpiresOn: date('cert_expires_on')
	},
	(t) => ({
		pk: primaryKey({ columns: [t.candidateId, t.disciplineId] }),
		certExpiryIdx: index('cde_cert_expiry_idx').on(t.requiresCert, t.certExpiresOn)
	})
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
		/**
		 * 'LICENSE' | 'CERTIFICATION' — which credential this series is about.
		 *
		 * Part of the unique key: a professional can hold both on one discipline,
		 * expiring on the same date, and without this the second one's entire series
		 * would look already-sent. DO NOT drop it, for the same reason as expiresOn.
		 */
		track: text('track').notNull(),
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
		// `track` before `expiresOn` so (candidate, discipline, track) is a usable
		// prefix for "have we ever chased this person about their certification".
		uniqueStage: uniqueIndex('candidate_cert_reminders_unique_stage_idx').on(
			t.candidateId,
			t.disciplineId,
			t.track,
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
/**
 * The 30-day grace clock for a MISSING license. One row per (professional,
 * discipline) episode of being out of compliance.
 *
 * Its existence IS the record that we told them, which is what makes a hard block
 * defensible: no notification, no row, no countdown. Written only by the nudge job,
 * never by an admin flagging a discipline — flagging must not start a silent clock
 * against someone who has not been told.
 *
 * The nudge job deletes the row once a license is on file, so a professional who
 * complies and much later loses their document gets a fresh 30 days rather than an
 * instant block from a stale clock.
 *
 * Only applies to LICENSE. An expired license blocks immediately with no grace, and
 * a missing CERTIFICATION never blocks at all.
 */
export const candidateLicenseGraceTable = pgTable(
	'candidate_license_grace',
	{
		candidateId: text('candidate_id')
			.notNull()
			.references(() => candidateProfileTable.id, { onDelete: 'cascade' }),
		disciplineId: text('discipline_id')
			.notNull()
			.references(() => disciplineTable.id, { onDelete: 'cascade' }),
		/** When the FIRST nudge of this episode was sent. Deadline = this + 30 days. */
		notifiedAt: timestamp('notified_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow(),
		/** Stamped when the "you are now blocked" message goes out, so it sends once. */
		blockedNotifiedAt: timestamp('blocked_notified_at', { withTimezone: true, mode: 'date' })
	},
	(t) => ({
		pk: primaryKey({ columns: [t.candidateId, t.disciplineId] })
	})
);

export type CandidateLicenseGrace = typeof candidateLicenseGraceTable.$inferInsert;
export type CandidateLicenseGraceSelect = typeof candidateLicenseGraceTable.$inferSelect;

export type CandidateCertReminder = typeof candidateCertRemindersTable.$inferInsert;
export type CandidateCertReminderSelect = typeof candidateCertRemindersTable.$inferSelect;

export type CandidateDocumentUploads = typeof candidateDocumentUploadsTable.$inferInsert;
export type CandidateDocumentUploadsSelect = typeof candidateDocumentUploadsTable.$inferSelect;
export type UpdateCandidateDocumentUploads = Partial<
	typeof candidateDocumentUploadsTable.$inferInsert
>;
