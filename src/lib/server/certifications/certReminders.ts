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
	candidateDisciplineExperienceTable,
	candidateProfileTable
} from '$lib/server/database/schemas/candidate';
import { disciplineTable } from '$lib/server/database/schemas/skill';
import { CANDIDATE_STATUS, USER_ROLES } from '$lib/config/constants';
import { logger } from '$lib/server/logger';
import { effectiveCertExpirySql, nyTodaySql } from './certGateSql';
import { daysUntilExpiry, todayInET } from './certStatus';
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

	const rows = (await db
		.select({
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
			effectiveExpiry: effectiveCertExpirySql()
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
				// Only disciplines that actually require a credential.
				eq(disciplineTable.requiresCertification, true),
				// Don't chase people who are denied, inactive or blacklisted.
				eq(candidateProfileTable.status, CANDIDATE_STATUS.ACTIVE),
				sql`coalesce(${userTable.blacklisted}, false) = false`,
				or(eq(userTable.receiveEmail, true), eq(userTable.receiveSms, true)),
				// A credential must be on file — a NULL expiry is the MISSING case, which
				// has no date to count down from and is handled by the nudge below.
				isNotNull(effectiveCertExpirySql()),
				// Window: 45 days lapsed through 60 days out. The floor stops the EXPIRED
				// band re-scanning ancient rows forever; the ledger would suppress them
				// anyway, but the scan should stay small.
				gte(effectiveCertExpirySql(), sql`${nyTodaySql} - interval '45 days'`),
				lte(effectiveCertExpirySql(), sql`${nyTodaySql} + interval '60 days'`)
			)
		)) as CertRow[];

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
export async function runMissingCredentialNudge(): Promise<{
	queued: number;
	suppressed: number;
	matched: number;
}> {
	const rows = await db
		.selectDistinct({
			userId: userTable.id,
			profileId: candidateProfileTable.id,
			email: userTable.email,
			firstName: userTable.firstName,
			lastName: userTable.lastName
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
				eq(disciplineTable.requiresCertification, true),
				eq(candidateProfileTable.status, CANDIDATE_STATUS.ACTIVE),
				eq(userTable.receiveEmail, true),
				sql`coalesce(${userTable.blacklisted}, false) = false`,
				// Nothing on file for this discipline.
				sql`${effectiveCertExpirySql()} IS NULL`
			)
		);

	const result = await enqueueAutoCampaign({
		key: AUTO_CAMPAIGN_KEYS.missingCredential,
		name: 'Automated — certificate needed',
		subject: 'Add your certification to keep getting matched',
		body: [
			'Hi {{firstName}},',
			'',
			'One or more of the disciplines on your profile requires a current',
			'certification or registration, and we do not have one on file for you yet.',
			'',
			'Adding it helps practices book you with confidence, and means you will not',
			'lose visibility of those shifts later on. You can upload it any time from',
			'Settings → Documents, and tick "this is a credential for one of my',
			'disciplines" so we know which one it belongs to.',
			'',
			'If you have already sent it to us, no action is needed.',
			'',
			'— Dental Temps Staffing Solutions'
		].join('\n'),
		audience: 'CANDIDATE',
		recipients: rows.map((r) => ({
			userId: r.userId,
			profileId: r.profileId,
			email: r.email,
			firstName: r.firstName,
			lastName: r.lastName
		})),
		// Weekly cron, fortnightly cadence per person.
		suppressWithinDays: 13
	});

	logger.info?.('runMissingCredentialNudge', { matched: rows.length, ...result });
	return { queued: result.queued, suppressed: result.suppressed, matched: rows.length };
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
			effectiveExpiry: effectiveCertExpirySql()
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
				eq(disciplineTable.requiresCertification, true),
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
			expiryDate: sql<string>`to_char((cdu.expiry_date AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD')`
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
