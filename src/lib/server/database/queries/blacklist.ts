/**
 * Candidate ↔ client-company blacklisting.
 *
 * A single `candidate_blacklists` row `(candidateId, companyId)` removes the
 * pair from each other's FUTURE-facing surfaces (qualified-candidate search,
 * candidate openings/calendar) while leaving all historical data untouched.
 * The relationship is symmetric — it doesn't matter whether the candidate, the
 * client, or an admin created the row; the effect is the same both ways.
 *
 * Creating a blacklist also soft-cancels the candidate's future-dated,
 * non-cancelled workdays for that company and reopens those recurrence days so
 * they can be refilled — mirroring the `unassignCandidate` cancel path
 * (cancellations.ts) so the audit trail and timesheet hours stay consistent.
 */

import { and, count, desc, eq, gt, ilike, isNull, or } from 'drizzle-orm';
import db from '$lib/server/database/drizzle';
import { candidateBlacklistTable, candidateProfileTable } from '../schemas/candidate';
import { userTable } from '../schemas/auth';
import { clientCompanyTable } from '../schemas/client';
import { recurrenceDayTable, requisitionTable, workdayTable } from '../schemas/requisition';
import {
	recordRecurrenceDayCancellation,
	stripWorkdayFromTimesheet,
	type CancellationRole
} from '$lib/server/cancellations';

interface AddBlacklistOptions {
	/** User performing the action — recorded on cancellation audit rows. */
	actorUserId?: string | null;
	/** Role of the actor, for the cancellation audit trail. */
	actorRole?: CancellationRole;
	/** Free-text reason, e.g. 'experience survey' or 'admin'. */
	reason?: string | null;
}

/**
 * Blacklist a candidate from a company and clear their future commitments to it.
 *
 * Idempotent: a duplicate `(candidateId, companyId)` insert is a no-op, but the
 * future-workday cleanup still runs so a re-trigger reconciles any stragglers.
 *
 * Returns the number of future workdays that were cancelled.
 */
export async function addCandidateToBlacklist(
	candidateId: string,
	companyId: string,
	options: AddBlacklistOptions = {}
): Promise<{ cancelledWorkdays: number }> {
	const actorUserId = options.actorUserId ?? null;
	const actorRole: CancellationRole = options.actorRole ?? 'SUPERADMIN';

	return db.transaction(async (tx) => {
		await tx
			.insert(candidateBlacklistTable)
			.values({ candidateId, companyId })
			.onConflictDoNothing();

		// Future-dated, still-active workdays this candidate holds for the company.
		const futureWorkdays = await tx
			.select({
				workdayId: workdayTable.id,
				timesheetId: workdayTable.timesheetId,
				// Read the non-null ids off the joined tables (the workday FKs are
				// nullable in the type but the inner joins guarantee a match here).
				requisitionId: requisitionTable.id,
				recurrenceDayId: recurrenceDayTable.id,
				recurrenceDate: recurrenceDayTable.date
			})
			.from(workdayTable)
			.innerJoin(requisitionTable, eq(requisitionTable.id, workdayTable.requisitionId))
			.innerJoin(recurrenceDayTable, eq(recurrenceDayTable.id, workdayTable.recurrenceDayId))
			.where(
				and(
					eq(workdayTable.candidateId, candidateId),
					eq(requisitionTable.companyId, companyId),
					isNull(workdayTable.cancelledAt),
					gt(recurrenceDayTable.dayStart, new Date())
				)
			);

		for (const wd of futureWorkdays) {
			await recordRecurrenceDayCancellation(tx, {
				recurrenceDayId: wd.recurrenceDayId,
				requisitionId: wd.requisitionId,
				cancelledByUserId: actorUserId ?? candidateId,
				cancelledByRole: actorRole,
				candidateId,
				reason: options.reason ?? 'candidate blacklisted'
			});

			// Soft-cancel the workday (keep the row for history) and detach hours.
			await stripWorkdayFromTimesheet(tx, {
				timesheetId: wd.timesheetId,
				workdayId: wd.workdayId,
				date: wd.recurrenceDate
			});

			await tx
				.update(workdayTable)
				.set({ cancelledAt: new Date(), timesheetId: null, updatedAt: new Date() })
				.where(eq(workdayTable.id, wd.workdayId));

			// Reopen the day so the client can refill it.
			await tx
				.update(recurrenceDayTable)
				.set({ status: 'OPEN', updatedAt: new Date() })
				.where(eq(recurrenceDayTable.id, wd.recurrenceDayId));
		}

		return { cancelledWorkdays: futureWorkdays.length };
	});
}

/**
 * Remove a blacklist entry. Does NOT restore previously-cancelled shifts —
 * an admin reassigns those manually if needed.
 */
export async function removeCandidateFromBlacklist(
	candidateId: string,
	companyId: string
): Promise<void> {
	await db
		.delete(candidateBlacklistTable)
		.where(
			and(
				eq(candidateBlacklistTable.candidateId, candidateId),
				eq(candidateBlacklistTable.companyId, companyId)
			)
		);
}

/** Is this candidate blacklisted from this company? */
export async function isCandidateBlacklisted(
	candidateId: string,
	companyId: string
): Promise<boolean> {
	const [row] = await db
		.select({ candidateId: candidateBlacklistTable.candidateId })
		.from(candidateBlacklistTable)
		.where(
			and(
				eq(candidateBlacklistTable.candidateId, candidateId),
				eq(candidateBlacklistTable.companyId, companyId)
			)
		)
		.limit(1);
	return !!row;
}

/** Company ids this candidate is blacklisted from — used to filter their feeds. */
export async function getBlacklistedCompanyIdsForCandidate(candidateId: string): Promise<string[]> {
	const rows = await db
		.select({ companyId: candidateBlacklistTable.companyId })
		.from(candidateBlacklistTable)
		.where(eq(candidateBlacklistTable.candidateId, candidateId));
	return rows.map((r) => r.companyId);
}

export type BlacklistedCandidate = {
	candidateId: string;
	firstName: string | null;
	lastName: string | null;
	email: string;
	avatarUrl: string | null;
	createdAt: Date;
};

/** Candidates currently blacklisted from a company, for the admin management card. */
export async function getBlacklistedCandidatesForCompany(
	companyId: string
): Promise<BlacklistedCandidate[]> {
	return db
		.select({
			candidateId: candidateBlacklistTable.candidateId,
			firstName: userTable.firstName,
			lastName: userTable.lastName,
			email: userTable.email,
			avatarUrl: userTable.avatarUrl,
			createdAt: candidateBlacklistTable.createdAt
		})
		.from(candidateBlacklistTable)
		.innerJoin(
			candidateProfileTable,
			eq(candidateProfileTable.id, candidateBlacklistTable.candidateId)
		)
		.innerJoin(userTable, eq(userTable.id, candidateProfileTable.userId))
		.where(eq(candidateBlacklistTable.companyId, companyId))
		.orderBy(candidateBlacklistTable.createdAt);
}

export type BlacklistEntry = {
	candidateId: string;
	companyId: string;
	firstName: string | null;
	lastName: string | null;
	email: string;
	avatarUrl: string | null;
	companyName: string | null;
	createdAt: Date;
};

/**
 * Master list of every blacklist entry across all companies, for the admin
 * management page. Supports a free-text search over candidate name/email and
 * company name, plus offset pagination. Returns the page of entries and the
 * total matching count.
 */
export async function getAllBlacklistEntries(options: {
	limit: number;
	offset: number;
	search?: string;
}): Promise<{ entries: BlacklistEntry[]; total: number }> {
	const search = options.search?.trim();
	const whereClause = search
		? or(
				ilike(userTable.firstName, `%${search}%`),
				ilike(userTable.lastName, `%${search}%`),
				ilike(userTable.email, `%${search}%`),
				ilike(clientCompanyTable.companyName, `%${search}%`)
			)
		: undefined;

	const base = db
		.select({
			candidateId: candidateBlacklistTable.candidateId,
			companyId: candidateBlacklistTable.companyId,
			firstName: userTable.firstName,
			lastName: userTable.lastName,
			email: userTable.email,
			avatarUrl: userTable.avatarUrl,
			companyName: clientCompanyTable.companyName,
			createdAt: candidateBlacklistTable.createdAt
		})
		.from(candidateBlacklistTable)
		.innerJoin(
			candidateProfileTable,
			eq(candidateProfileTable.id, candidateBlacklistTable.candidateId)
		)
		.innerJoin(userTable, eq(userTable.id, candidateProfileTable.userId))
		.innerJoin(clientCompanyTable, eq(clientCompanyTable.id, candidateBlacklistTable.companyId));

	const [entries, [{ value: total }]] = await Promise.all([
		base
			.where(whereClause)
			.orderBy(desc(candidateBlacklistTable.createdAt))
			.limit(options.limit)
			.offset(options.offset),
		db
			.select({ value: count() })
			.from(candidateBlacklistTable)
			.innerJoin(
				candidateProfileTable,
				eq(candidateProfileTable.id, candidateBlacklistTable.candidateId)
			)
			.innerJoin(userTable, eq(userTable.id, candidateProfileTable.userId))
			.innerJoin(clientCompanyTable, eq(clientCompanyTable.id, candidateBlacklistTable.companyId))
			.where(whereClause)
	]);

	return { entries, total };
}
