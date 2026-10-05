/**
 * The 60/30/14/7/day-of/day-after certification expiry series, plus the weekly
 * "you have no certificate on file" nudge and the admin digest.
 *
 * WHY NOT `enqueueAutoCampaign` FOR THE EXPIRY SERIES: campaign bodies interpolate
 * only {{firstName}}/{{lastName}} (campaigns/autoCampaign.ts), and a reminder that
 * cannot say "your Registered Dental Hygienist registration expires April 30" is not
 * a reminder. Campaigns are also email-only (the last stages need SMS) and suppress
 * on a time window, which cannot express "start again because they renewed". The
 * MISSING nudge below has none of those needs, so it DOES use the campaign path.
 */

import { and, asc, desc, eq, gte, isNotNull, lte, or, sql } from 'drizzle-orm';
import db from '$lib/server/database/drizzle';
import { userTable } from '$lib/server/database/schemas/auth';
import {
	candidateCertRemindersTable,
	candidateLicenseGraceTable,
	candidateDisciplineExperienceTable,
	candidateProfileTable
} from '$lib/server/database/schemas/candidate';
import { disciplineTable } from '$lib/server/database/schemas/skill';
import { CANDIDATE_STATUS, USER_ROLES } from '$lib/config/constants';
import { logger } from '$lib/server/logger';
import { effectiveLicenseExpirySql, nyTodaySql } from './credentialGateSql';
import {
	LICENSE_GRACE_DAYS,
	daysUntilExpiry,
	todayInET,
	type CredentialTrack
} from './credentialStatus';
import {
	AUTO_CAMPAIGN_KEYS,
	enqueueAutoCampaign
} from '$lib/server/campaigns/autoCampaign';

/** Days before expiry at which a warning goes out. Descending. */
export const CERT_REMINDER_OFFSETS = [60, 30, 14, 7, 0] as const;

export type CertReminderStage = 'D60' | 'D30' | 'D14' | 'D7' | 'D0' | 'EXPIRED';

/**
 * Stages that also send SMS. 'EXPIRED' is included because it is the only message
 * that reports a consequence already in effect — their shifts are gone right now.
 */
export const SMS_STAGES: ReadonlySet<CertReminderStage> = new Set<CertReminderStage>([
	'D7',
	'D0',
	'EXPIRED'
]);

export type CertRow = {
	/** Which credential this row is about. Both can exist for one discipline. */
	track: CredentialTrack;
	candidateId: string;
	userId: string;
	firstName: string | null;
	lastName: string | null;
	email: string;
	phone: string | null;
	receiveEmail: boolean;
	receiveSms: boolean;
	disciplineId: string;
	disciplineName: string;
	abbreviation: string;
	/** 'YYYY-MM-DD' — MAX(expiry_date) across the discipline's linked credentials. */
	effectiveExpiry: string;
};

export type CertReminderPlan = {
	row: CertRow;
	stage: CertReminderStage;
	daysUntil: number;
	/** Channels this plan will attempt, after per-user opt-out. */
	channels: ('EMAIL' | 'SMS')[];
};

/**
 * Which stage (if any) a credential is due for today.
 *
 * BANDED, not exact-match. The obvious implementation fires only when daysUntil is
 * exactly 60/30/14/7/0, which is what `processWorkday48HrReminder` does — but that
 * works there because the cron is hourly and its window is an hour wide. This cron
 * runs daily, so one missed run (deploy, Railway restart, DB blip) would skip a stage
 * permanently. Banding means a missed run sends LATE rather than never.
 *
 * It also handles a credential uploaded days before it lapses: at 3 days out they get
 * D7 → D0 → EXPIRED, never a nonsensical "expires in 60 days".
 */
export function stageFor(daysUntil: number): CertReminderStage | null {
	if (daysUntil < 0) return 'EXPIRED';
	if (daysUntil > CERT_REMINDER_OFFSETS[0]) return null;
	const offset = [...CERT_REMINDER_OFFSETS].reverse().find((o) => daysUntil <= o);
	return offset === undefined ? null : (`D${offset}` as CertReminderStage);
}

/**
 * PURE: turn today's candidate rows into the set of reminders to send.
 * Everything that needs the database happens in `runCertExpiryReminders`.
 */
export function selectCertRemindersToSend(
	rows: CertRow[],
	today: string = todayInET()
): CertReminderPlan[] {
	const plans: CertReminderPlan[] = [];

	for (const row of rows) {
		const daysUntil = daysUntilExpiry(row.effectiveExpiry, today);
		const stage = stageFor(daysUntil);
		if (!stage) continue;

		// Opt-out is applied HERE, at audience-build time. This codebase never filters
		// it at send time, so a missing check mails people who opted out.
		const channels: ('EMAIL' | 'SMS')[] = [];
		if (row.receiveEmail) channels.push('EMAIL');
		if (row.receiveSms && SMS_STAGES.has(stage) && row.phone) channels.push('SMS');
		if (channels.length === 0) continue;

		plans.push({ row, stage, daysUntil, channels });
	}

	return plans;
}

/**
 * Daily: send the expiry series.
 *
 * Exactly-once is enforced by the UNIQUE index on
 * (candidate_id, discipline_id, expires_on, stage), claimed BEFORE sending. A crash
 * between claim and send loses at most one notification; the alternative (send then
 * record) duplicates SMS on a retry, which is worse. The next stage still lands.
 */
export async function runCertExpiryReminders(): Promise<{
	scanned: number;
	sent: number;
	suppressed: number;
	failures: number;
}> {
	const today = todayInET();

	// Two selects rather than one with an OR: the predicates differ in kind (a
	// document subquery for the license, two row columns for the certification), so
	// a single query would need a CASE around the window clauses anyway.
	const baseJoins = (q: ReturnType<typeof db.select>) =>
		q
			.from(candidateDisciplineExperienceTable)
			.innerJoin(
				candidateProfileTable,
				eq(candidateProfileTable.id, candidateDisciplineExperienceTable.candidateId)
			)
			.innerJoin(userTable, eq(userTable.id, candidateProfileTable.userId))
			.innerJoin(
				disciplineTable,
				eq(disciplineTable.id, candidateDisciplineExperienceTable.disciplineId)
			);

	// Shared audience rules. Opt-out is filtered HERE, at audience-build time: this
	// codebase never filters it when the queue drains.
	const audience = [
		eq(candidateProfileTable.status, CANDIDATE_STATUS.ACTIVE),
		sql`coalesce(${userTable.blacklisted}, false) = false`,
		or(eq(userTable.receiveEmail, true), eq(userTable.receiveSms, true))
	];

	const selectFor = (expiry: ReturnType<typeof effectiveLicenseExpirySql>) => ({
		candidateId: candidateProfileTable.id,
		userId: userTable.id,
		firstName: userTable.firstName,
		lastName: userTable.lastName,
		email: userTable.email,
		phone: candidateProfileTable.cellPhone,
		receiveEmail: userTable.receiveEmail,
		receiveSms: userTable.receiveSms,
		disciplineId: candidateDisciplineExperienceTable.disciplineId,
		disciplineName: disciplineTable.name,
		abbreviation: disciplineTable.abbreviation,
		effectiveExpiry: expiry
	});

	// Window: 45 days lapsed through 60 days out. The floor stops the EXPIRED band
	// re-scanning ancient rows forever; the ledger would suppress them anyway.
	const inWindow = (expr: ReturnType<typeof effectiveLicenseExpirySql>) => [
		isNotNull(expr),
		gte(expr, sql`${nyTodaySql} - interval '45 days'`),
		lte(expr, sql`${nyTodaySql} + interval '60 days'`)
	];

	const licenseRows = (await baseJoins(
		db.select(selectFor(effectiveLicenseExpirySql()))
	).where(
		and(eq(disciplineTable.requiresLicense, true), ...audience, ...inWindow(effectiveLicenseExpirySql()))
	)) as Omit<CertRow, 'track'>[];

	const certExpiry = sql<
		string | null
	>`to_char(${candidateDisciplineExperienceTable.certExpiresOn}, 'YYYY-MM-DD')`;

	const certRows = (await baseJoins(db.select(selectFor(certExpiry))).where(
		and(
			eq(candidateDisciplineExperienceTable.requiresCert, true),
			...audience,
			...inWindow(certExpiry)
		)
	)) as Omit<CertRow, 'track'>[];

	const rows: CertRow[] = [
		...licenseRows.map((r) => ({ ...r, track: 'LICENSE' as const })),
		...certRows.map((r) => ({ ...r, track: 'CERTIFICATION' as const }))
	];

	const plans = selectCertRemindersToSend(rows, today);

	let sent = 0;
	let suppressed = 0;
	let failures = 0;

	// Imported lazily so this module stays importable by tests without pulling in the
	// whole email/SMS stack.
	const { notifyCertExpiring } = await import('$lib/server/notifications/transactional');

	for (const plan of plans) {
		try {
			// Claim first. ON CONFLICT DO NOTHING makes a concurrent or repeated run a
			// no-op rather than a double send.
			const [claim] = await db
				.insert(candidateCertRemindersTable)
				.values({
					candidateId: plan.row.candidateId,
					disciplineId: plan.row.disciplineId,
					// Part of the unique key: a license and a certification can expire on
					// the same date for the same discipline, and without this the second
					// one's whole series would look already-sent.
					track: plan.row.track,
					expiresOn: plan.row.effectiveExpiry,
					stage: plan.stage,
					channels: plan.channels.join('+')
				})
				.onConflictDoNothing()
				.returning({ id: candidateCertRemindersTable.id });

			if (!claim) {
				suppressed++;
				continue;
			}

			await notifyCertExpiring({
				email: plan.row.email,
				phone: plan.row.phone,
				firstName: plan.row.firstName,
				disciplineName: plan.row.disciplineName,
				abbreviation: plan.row.abbreviation,
				expiresOn: plan.row.effectiveExpiry,
				daysUntil: plan.daysUntil,
				stage: plan.stage,
				track: plan.row.track,
				channels: plan.channels
			});
			sent++;
		} catch (error) {
			failures++;
			logger.error('certExpiryReminder failed', {
				error,
				candidateId: plan.row.candidateId,
				disciplineId: plan.row.disciplineId,
				stage: plan.stage
			});
		}
	}

	logger.info?.('runCertExpiryReminders', { scanned: rows.length, sent, suppressed, failures });
	return { scanned: rows.length, sent, suppressed, failures };
}

/**
 * Weekly: professionals holding a discipline that requires a credential, with none on
 * file. This is the MISSING state — chased, never blocked.
 *
 * Uses `enqueueAutoCampaign` because the copy needs no per-person data, which buys
 * batching, throttling, the unsubscribe footer and last_contacted_at stamping. The
 * fortnightly suppression reflects that this is a backlog being worked through by
 * staff, not an emergency.
 */
/**
 * Weekly: the missing-LICENSE audience, and the owner of the 30-day grace clock.
 *
 * Three responsibilities, in this order because each depends on the previous:
 *
 *   1. Clear stale clocks for anyone who now has a license on file. Without this,
 *      someone who complies and much later loses their document is blocked instantly
 *      by a years-old row instead of getting a fresh 30 days.
 *   2. Start clocks and nudge. The insert and the send are ONE decision: a grace row
 *      written without a send would start a countdown nobody was told about, and
 *      "we never told them" is the whole justification for a hard block.
 *   3. Fire the block notice once, for rows past the deadline.
 *
 * The CERTIFICATION track has no equivalent. A declared certification with no date
 * can only come from an admin slip, so it is a digest line rather than a nudge, and
 * it never blocks.
 */
export async function runMissingCredentialNudge(opts?: { dryRun?: boolean }): Promise<{
	queued: number;
	suppressed: number;
	matched: number;
	cleared: number;
	blocked: number;
	/** dryRun only: exactly who the audience query matched, and their clock state. */
	audience?: Array<{
		name: string;
		email: string;
		discipline: string;
		notifiedAt: string | null;
		graceDaysRemaining: number | null;
		blockedNotified: boolean;
	}>;
}> {
	// A dry run answers "would this reach anyone, and who" without writing a grace
	// row, sending a message, or queueing a campaign. Verifying the audience by
	// re-implementing this predicate elsewhere is how a diagnostic ends up
	// disagreeing with the job it is meant to be checking, so it runs the real one.
	const dryRun = opts?.dryRun === true;

	// --- 1. Clear clocks for anyone who has since supplied a license ----------
	const cleared = dryRun
		? { rowCount: 0 }
		: await db.execute(sql`
		DELETE FROM candidate_license_grace g
		WHERE EXISTS (
			SELECT 1 FROM candidate_document_uploads cdu
			WHERE cdu.candidate_id = g.candidate_id
				AND cdu.discipline_id = g.discipline_id
				AND cdu.type = 'LICENSE'
				AND cdu.expiry_date IS NOT NULL
		)
	`);

	// --- 2. Who requires a license and has none on file? ----------------------
	const missing = await db
		.select({
			userId: userTable.id,
			candidateId: candidateProfileTable.id,
			disciplineId: candidateDisciplineExperienceTable.disciplineId,
			disciplineName: disciplineTable.name,
			abbreviation: disciplineTable.abbreviation,
			email: userTable.email,
			phone: candidateProfileTable.cellPhone,
			firstName: userTable.firstName,
			lastName: userTable.lastName,
			receiveSms: userTable.receiveSms,
			notifiedAt: sql<string | null>`to_char(
				(SELECT (g.notified_at AT TIME ZONE 'UTC')::date
				 FROM candidate_license_grace g
				 WHERE g.candidate_id = ${candidateProfileTable.id}
					 AND g.discipline_id = ${candidateDisciplineExperienceTable.disciplineId}),
				'YYYY-MM-DD')`,
			blockedNotified: sql<boolean>`EXISTS (
				SELECT 1 FROM candidate_license_grace g
				WHERE g.candidate_id = ${candidateProfileTable.id}
					AND g.discipline_id = ${candidateDisciplineExperienceTable.disciplineId}
					AND g.blocked_notified_at IS NOT NULL
			)`
		})
		.from(candidateDisciplineExperienceTable)
		.innerJoin(
			candidateProfileTable,
			eq(candidateProfileTable.id, candidateDisciplineExperienceTable.candidateId)
		)
		.innerJoin(userTable, eq(userTable.id, candidateProfileTable.userId))
		.innerJoin(
			disciplineTable,
			eq(disciplineTable.id, candidateDisciplineExperienceTable.disciplineId)
		)
		.where(
			and(
				eq(disciplineTable.requiresLicense, true),
				eq(candidateProfileTable.status, CANDIDATE_STATUS.ACTIVE),
				sql`coalesce(${userTable.blacklisted}, false) = false`,
				sql`${effectiveLicenseExpirySql()} IS NULL`
			)
		);

	const today = todayInET();

	if (dryRun) {
		return {
			queued: 0,
			suppressed: 0,
			matched: missing.length,
			cleared: 0,
			blocked: 0,
			audience: missing.map((r) => ({
				name: `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim(),
				email: r.email,
				discipline: r.abbreviation ?? r.disciplineName,
				notifiedAt: r.notifiedAt,
				// Negative means the deadline has already passed and the gate is
				// already hiding those jobs.
				graceDaysRemaining: r.notifiedAt
					? daysUntilExpiry(r.notifiedAt, today) + LICENSE_GRACE_DAYS
					: null,
				blockedNotified: r.blockedNotified
			}))
		};
	}

	// Start a clock for anyone not yet on one. ON CONFLICT DO NOTHING so a re-run is
	// a no-op and the deadline never silently moves.
	const newlyNotified: typeof missing = [];
	for (const row of missing) {
		if (row.notifiedAt) continue;
		const [claim] = await db
			.insert(candidateLicenseGraceTable)
			.values({ candidateId: row.candidateId, disciplineId: row.disciplineId })
			.onConflictDoNothing()
			.returning({ candidateId: candidateLicenseGraceTable.candidateId });
		if (claim) newlyNotified.push(row);
	}

	// --- 3. Anyone whose grace has run out, who has not yet been told ---------
	const { notifyLicenseGraceExpired } = await import('$lib/server/notifications/transactional');
	let blocked = 0;
	for (const row of missing) {
		if (!row.notifiedAt || row.blockedNotified) continue;
		if (daysUntilExpiry(row.notifiedAt, today) + LICENSE_GRACE_DAYS > 0) continue;

		// Stamp first, then send — a crash after stamping loses one message; the
		// reverse duplicates an SMS announcing that someone's work has stopped.
		await db
			.update(candidateLicenseGraceTable)
			.set({ blockedNotifiedAt: new Date() })
			.where(
				and(
					eq(candidateLicenseGraceTable.candidateId, row.candidateId),
					eq(candidateLicenseGraceTable.disciplineId, row.disciplineId)
				)
			);

		await notifyLicenseGraceExpired({
			email: row.email,
			phone: row.phone,
			firstName: row.firstName,
			disciplineName: row.disciplineName,
			abbreviation: row.abbreviation,
			receiveSms: row.receiveSms
		});
		blocked++;
	}

	// The fortnightly nudge itself, unchanged in cadence. Audience is everyone still
	// missing a license, including those just put on the clock.
	const recipients = missing.filter((r) => !r.blockedNotified);
	const result = await enqueueAutoCampaign({
		key: AUTO_CAMPAIGN_KEYS.missingCredential,
		name: 'Automated — license/registration needed',
		subject: 'Upload your license or registration to keep getting matched',
		body: [
			'Hi {{firstName}},',
			'',
			'One or more of the disciplines on your profile legally requires a current',
			'license or registration, and we do not have one on file for you yet.',
			'',
			`You have ${LICENSE_GRACE_DAYS} days from our first notice to upload it. After that`,
			'those shifts will be hidden from your account until we have it — your other',
			'disciplines are not affected.',
			'',
			'You can upload it any time from Settings → Documents. Tick "this is a',
			'credential for one of my disciplines" so we know which one it belongs to.',
			'',
			'If you have already sent it to us, no action is needed.',
			'',
			'— Dental Temps Staffing Solutions'
		].join('\n'),
		audience: 'CANDIDATE',
		recipients: recipients.map((r) => ({
			userId: r.userId,
			profileId: r.candidateId,
			email: r.email,
			firstName: r.firstName,
			lastName: r.lastName
		})),
		suppressWithinDays: 13
	});

	logger.info?.('runMissingCredentialNudge', {
		matched: missing.length,
		newlyNotified: newlyNotified.length,
		cleared: (cleared as { rowCount?: number })?.rowCount ?? 0,
		blocked,
		...result
	});

	return {
		queued: result.queued,
		suppressed: result.suppressed,
		matched: missing.length,
		cleared: (cleared as { rowCount?: number })?.rowCount ?? 0,
		blocked
	};
}

/**
 * Weekly internal digest of credential state. Five sections, urgency-ordered.
 *
 * Section 1 is the reason this is not optional: hiding future listings does nothing
 * about a shift already assigned, so an expired credential on a booked workday is the
 * one case the gate cannot protect against. Staff have to see it.
 */
export async function runCertExpiryAdminDigest(): Promise<{
	bookedWithExpired: number;
	expired: number;
	expiring: number;
	missing: number;
	recent: number;
	sent: boolean;
}> {
	const today = todayInET();

	// Every ACTIVE professional's entry on a discipline that requires a credential,
	// with its effective expiry. One query; the sections are partitioned in memory
	// because the row counts here are small (hundreds, not millions).
	const rows = await db
		.select({
			candidateId: candidateProfileTable.id,
			firstName: userTable.firstName,
			lastName: userTable.lastName,
			disciplineId: candidateDisciplineExperienceTable.disciplineId,
			disciplineName: disciplineTable.name,
			abbreviation: disciplineTable.abbreviation,
			effectiveExpiry: effectiveLicenseExpirySql()
		})
		.from(candidateDisciplineExperienceTable)
		.innerJoin(
			candidateProfileTable,
			eq(candidateProfileTable.id, candidateDisciplineExperienceTable.candidateId)
		)
		.innerJoin(userTable, eq(userTable.id, candidateProfileTable.userId))
		.innerJoin(
			disciplineTable,
			eq(disciplineTable.id, candidateDisciplineExperienceTable.disciplineId)
		)
		.where(
			and(
				eq(disciplineTable.requiresLicense, true),
				eq(candidateProfileTable.status, CANDIDATE_STATUS.ACTIVE)
			)
		);

	const name = (r: { firstName: string | null; lastName: string | null }) =>
		`${r.firstName ?? ''} ${r.lastName ?? ''}`.trim() || 'Unknown';

	const expiredRows = rows.filter((r) => r.effectiveExpiry && r.effectiveExpiry < today);
	const expiringRows = rows.filter(
		(r) =>
			r.effectiveExpiry &&
			r.effectiveExpiry >= today &&
			daysUntilExpiry(r.effectiveExpiry, today) <= 30
	);
	const missingRows = rows.filter((r) => !r.effectiveExpiry);

	// Section 1: anyone in `expiredRows` with a future workday on a requisition for
	// that same discipline.
	const { recurrenceDayTable, requisitionTable, workdayTable } = await import(
		'$lib/server/database/schemas/requisition'
	);

	const bookedWithExpired: Array<{
		name: string;
		discipline: string;
		expiresOn: string;
		shiftDates: string;
		candidateId: string;
	}> = [];

	if (expiredRows.length > 0) {
		const upcoming = await db
			.select({
				candidateId: workdayTable.candidateId,
				disciplineId: requisitionTable.disciplineId,
				date: recurrenceDayTable.date
			})
			.from(workdayTable)
			.innerJoin(requisitionTable, eq(requisitionTable.id, workdayTable.requisitionId))
			.innerJoin(
				recurrenceDayTable,
				eq(recurrenceDayTable.id, workdayTable.recurrenceDayId)
			)
			.where(gte(recurrenceDayTable.date, today))
			.orderBy(asc(recurrenceDayTable.date));

		for (const r of expiredRows) {
			const shifts = upcoming.filter(
				(w) => w.candidateId === r.candidateId && w.disciplineId === r.disciplineId
			);
			if (shifts.length === 0) continue;
			bookedWithExpired.push({
				name: name(r),
				discipline: `${r.disciplineName} (${r.abbreviation})`,
				expiresOn: r.effectiveExpiry as string,
				shiftDates: shifts
					.slice(0, 4)
					.map((s) => s.date)
					.join(', ') + (shifts.length > 4 ? ` +${shifts.length - 4} more` : ''),
				candidateId: r.candidateId
			});
		}
	}

	// Section 5: credentials added in the last 7 days — the verification queue.
	const recentRows = await db
		.select({
			candidateId: candidateProfileTable.id,
			firstName: userTable.firstName,
			lastName: userTable.lastName,
			disciplineName: disciplineTable.name,
			abbreviation: disciplineTable.abbreviation,
			expiryDate: sql<string>`to_char(cdu.expiry_date, 'YYYY-MM-DD')`
		})
		.from(sql`candidate_document_uploads cdu`)
		.innerJoin(candidateProfileTable, sql`${candidateProfileTable.id} = cdu.candidate_id`)
		.innerJoin(userTable, eq(userTable.id, candidateProfileTable.userId))
		.innerJoin(disciplineTable, sql`${disciplineTable.id} = cdu.discipline_id`)
		.where(
			sql`cdu.discipline_id IS NOT NULL
				AND cdu.expiry_date IS NOT NULL
				AND cdu.created_at >= now() - interval '7 days'`
		);

	const sections = {
		bookedWithExpired,
		expired: expiredRows.map((r) => ({
			name: name(r),
			discipline: `${r.disciplineName} (${r.abbreviation})`,
			expiresOn: r.effectiveExpiry as string,
			candidateId: r.candidateId
		})),
		expiring: expiringRows.map((r) => ({
			name: name(r),
			discipline: `${r.disciplineName} (${r.abbreviation})`,
			expiresOn: r.effectiveExpiry as string,
			candidateId: r.candidateId
		})),
		// Grouped, not listed: on the first runs this is the legacy backlog and could be
		// hundreds of rows. The count per discipline is what staff act on.
		missing: Object.entries(
			missingRows.reduce<Record<string, number>>((acc, r) => {
				const k = `${r.disciplineName} (${r.abbreviation})`;
				acc[k] = (acc[k] ?? 0) + 1;
				return acc;
			}, {})
		).map(([discipline, count]) => ({ discipline, count })),
		recent: recentRows.map((r) => ({
			name: name(r),
			discipline: `${r.disciplineName} (${r.abbreviation})`,
			expiresOn: r.expiryDate,
			candidateId: r.candidateId
		}))
	};

	const total =
		sections.bookedWithExpired.length +
		sections.expired.length +
		sections.expiring.length +
		sections.missing.length +
		sections.recent.length;

	if (total === 0) {
		return {
			bookedWithExpired: 0,
			expired: 0,
			expiring: 0,
			missing: 0,
			recent: 0,
			sent: false
		};
	}

	const { notifyAdminsOfCertExpiryDigest } = await import(
		'$lib/server/notifications/transactional'
	);
	await notifyAdminsOfCertExpiryDigest(sections);

	logger.info?.('runCertExpiryAdminDigest', {
		bookedWithExpired: sections.bookedWithExpired.length,
		expired: sections.expired.length,
		expiring: sections.expiring.length,
		missing: sections.missing.length,
		recent: sections.recent.length
	});

	return {
		bookedWithExpired: sections.bookedWithExpired.length,
		expired: sections.expired.length,
		expiring: sections.expiring.length,
		missing: sections.missing.reduce((n, m) => n + m.count, 0),
		recent: sections.recent.length,
		sent: true
	};
}
