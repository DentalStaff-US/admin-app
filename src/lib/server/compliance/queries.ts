/**
 * Reads for the Compliance widget and page. Classification lives in
 * `complianceRule.ts`; credential dates come from `credentialSelectFields()`, the
 * same projection the matching gate uses, so the two can't disagree.
 */

import db from '$lib/server/database/drizzle';
import { and, eq, gte, isNull, ne, or, sql } from 'drizzle-orm';
import { userTable } from '$lib/server/database/schemas/auth';
import {
	candidateDisciplineExperienceTable,
	candidateProfileTable
} from '$lib/server/database/schemas/candidate';
import { disciplineTable } from '$lib/server/database/schemas/skill';
import {
	recurrenceDayTable,
	requisitionTable,
	workdayTable
} from '$lib/server/database/schemas/requisition';
import { actionHistoryTable, complianceSnoozeTable } from '$lib/server/database/schemas/admin';
import { CANDIDATE_STATUS } from '$lib/config/constants';
import { credentialSelectFields } from '$lib/server/certifications/credentialGateSql';
import { todayInET } from '$lib/server/certifications/credentialStatus';
import {
	applySnoozes,
	classifyProfessional,
	snoozeKey,
	sortComplianceItems,
	summarizeCompliance,
	type ComplianceItem,
	type ComplianceShift,
	type ComplianceSummary
} from '$lib/server/compliance/complianceRule';

/** A second reminder for the same item inside this window is refused. */
export const REMINDER_THROTTLE_MS = 24 * 60 * 60 * 1000;

/** Every unresolved compliance item, most urgent first, snoozes attached. */
export async function getComplianceItems(): Promise<ComplianceItem[]> {
	const today = todayInET();

	const [rows, shifts, snoozes, reminders] = await Promise.all([
		// Every ACTIVE professional's discipline that requires a credential on either track.
		db
			.select({
				candidateId: candidateProfileTable.id,
				firstName: userTable.firstName,
				lastName: userTable.lastName,
				disciplineId: candidateDisciplineExperienceTable.disciplineId,
				disciplineName: disciplineTable.name,
				abbreviation: disciplineTable.abbreviation,
				...credentialSelectFields()
			})
			.from(candidateDisciplineExperienceTable)
			.innerJoin(
				candidateProfileTable,
				eq(candidateProfileTable.id, candidateDisciplineExperienceTable.candidateId)
			)
			.innerJoin(userTable, eq(userTable.id, candidateProfileTable.userId))
			.innerJoin(disciplineTable, eq(disciplineTable.id, candidateDisciplineExperienceTable.disciplineId))
			.where(
				and(
					eq(candidateProfileTable.status, CANDIDATE_STATUS.ACTIVE),
					or(
						eq(disciplineTable.requiresLicense, true),
						eq(candidateDisciplineExperienceTable.requiresCert, true)
					)
				)
			),
		// Live, upcoming assignments — what a lapsed credential puts at risk.
		db
			.select({
				candidateId: workdayTable.candidateId,
				disciplineId: requisitionTable.disciplineId,
				requisitionId: requisitionTable.id,
				recurrenceDayId: recurrenceDayTable.id,
				date: recurrenceDayTable.date
			})
			.from(workdayTable)
			.innerJoin(recurrenceDayTable, eq(recurrenceDayTable.id, workdayTable.recurrenceDayId))
			.innerJoin(requisitionTable, eq(requisitionTable.id, workdayTable.requisitionId))
			.where(
				and(
					isNull(workdayTable.cancelledAt),
					eq(recurrenceDayTable.archived, false),
					ne(recurrenceDayTable.status, 'CANCELED'),
					gte(recurrenceDayTable.dayStart, new Date())
				)
			)
			.orderBy(recurrenceDayTable.dayStart),
		db
			.select()
			.from(complianceSnoozeTable)
			.where(gte(complianceSnoozeTable.snoozedUntil, today)),
		db
			.select({
				subjectId: actionHistoryTable.entityId,
				ruleKey: sql<string>`${actionHistoryTable.metadata}->>'ruleKey'`,
				createdAt: actionHistoryTable.createdAt
			})
			.from(actionHistoryTable)
			.where(
				and(
					eq(actionHistoryTable.action, 'REMIND'),
					gte(actionHistoryTable.createdAt, new Date(Date.now() - REMINDER_THROTTLE_MS))
				)
			)
	]);

	const shiftsByKey = new Map<string, ComplianceShift[]>();
	for (const s of shifts) {
		const key = `${s.candidateId}|${s.disciplineId}`;
		const list = shiftsByKey.get(key) ?? [];
		list.push({ requisitionId: s.requisitionId, recurrenceDayId: s.recurrenceDayId, date: s.date });
		shiftsByKey.set(key, list);
	}

	const items = rows.flatMap((r) =>
		classifyProfessional(
			{
				candidateId: r.candidateId,
				name: `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim() || 'Unknown',
				disciplineId: r.disciplineId,
				disciplineName: r.disciplineName,
				abbreviation: r.abbreviation,
				license: r.license,
				certification: r.certification
			},
			shiftsByKey.get(`${r.candidateId}|${r.disciplineId}`) ?? [],
			today
		)
	);

	const snoozeMap = new Map(
		snoozes.map((s) => [snoozeKey(s.subjectType, s.subjectId, s.ruleKey), s.snoozedUntil])
	);
	const remindedMap = new Map(
		reminders.map((r) => [`${r.subjectId}|${r.ruleKey}`, r.createdAt.toISOString()])
	);

	return sortComplianceItems(applySnoozes(items, snoozeMap, today)).map((item) => ({
		...item,
		remindedAt: remindedMap.get(`${item.subjectId}|${item.ruleKey}`) ?? null
	}));
}

export async function getComplianceSummary(): Promise<ComplianceSummary> {
	return summarizeCompliance(await getComplianceItems());
}
