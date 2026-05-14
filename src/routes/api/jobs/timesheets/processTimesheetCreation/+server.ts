import { json, type RequestHandler } from '@sveltejs/kit';
import db from '$lib/server/database/drizzle';
import {
	workdayTable,
	recurrenceDayTable,
	requisitionTable,
	timeSheetTable
} from '$lib/server/database/schemas/requisition';
import { candidateProfileTable } from '$lib/server/database/schemas/candidate';
import { clientCompanyTable } from '$lib/server/database/schemas/client';
import { and, eq, isNull, lte } from 'drizzle-orm';
import crypto from 'crypto';
import { CRON_SECRET } from '$env/static/private';
import { toZonedTime } from 'date-fns-tz';
import { notifyTimesheetCreated } from '$lib/server/notifications/transactional';
import { verifyJobRequest } from '$lib/server/jobs/sign';
import { tryWithAdvisoryLock } from '$lib/server/jobs/withAdvisoryLock';

export const POST: RequestHandler = async ({ request }) => {
	const verified = verifyJobRequest(request.headers, 'processTimesheetCreation', CRON_SECRET);
	if (!verified.ok) {
		return new Response(`Unauthorized: ${verified.reason}`, { status: 401 });
	}

	const result = await tryWithAdvisoryLock('processTimesheetCreation', async () => {
		try {
			const now = new Date();

			// Find all workdays where:
			// - timesheetId is null (not yet linked)
			// - recurrenceDay.dayStart has passed
			// - the workday hasn't been cancelled (admin/client-cancelled workdays
			//   stay in the table for calendar visibility but must not get a
			//   timesheet created against them)
			const eligibleWorkdays = await db
				.select({
					workday: workdayTable,
					recurrenceDay: recurrenceDayTable,
					requisition: requisitionTable,
					candidateProfile: candidateProfileTable
				})
				.from(workdayTable)
				.innerJoin(recurrenceDayTable, eq(recurrenceDayTable.id, workdayTable.recurrenceDayId))
				.innerJoin(requisitionTable, eq(requisitionTable.id, workdayTable.requisitionId))
				.innerJoin(candidateProfileTable, eq(candidateProfileTable.id, workdayTable.candidateId))
				.where(
					and(
						isNull(workdayTable.timesheetId),
						isNull(workdayTable.cancelledAt),
						lte(recurrenceDayTable.dayStart, now)
					)
				);

			if (eligibleWorkdays.length === 0) {
				return json({ success: true, noop: true });
			}

			// Group workdays by (candidateId, requisitionId, weekBeginDate)
			// Week begin date is Monday in the requisition's timezone
			const groups = new Map<
				string,
				{
					candidateId: string;
					requisitionId: number;
					weekBeginDate: string;
					clientId: string;
					workdayIds: string[];
				}
			>();

			for (const row of eligibleWorkdays) {
				const tz = row.requisition.referenceTimezone || 'America/New_York';
				const dayStartInTz = toZonedTime(row.recurrenceDay.dayStart, tz);

				// Calculate Monday of this week in the requisition's timezone
				const dayOfWeek = dayStartInTz.getDay(); // 0=Sun, 1=Mon ... 6=Sat
				const diffToMonday = (dayOfWeek + 6) % 7;
				const monday = new Date(dayStartInTz);
				monday.setDate(dayStartInTz.getDate() - diffToMonday);
				const weekBeginDate = monday.toISOString().split('T')[0];

				const key = `${row.workday.candidateId}::${row.workday.requisitionId}::${weekBeginDate}`;

				if (!groups.has(key)) {
					// Get the client company ID from the requisition's company
					const [company] = await db
						.select({ clientId: clientCompanyTable.clientId })
						.from(clientCompanyTable)
						.where(eq(clientCompanyTable.id, row.requisition.companyId))
						.limit(1);

					groups.set(key, {
						candidateId: row.workday.candidateId,
						requisitionId: row.workday.requisitionId,
						weekBeginDate,
						clientId: company?.clientId ?? '',
						workdayIds: []
					});
				}

				groups.get(key)!.workdayIds.push(row.workday.id);
			}

			let created = 0;
			let linked = 0;

			// Process each group
			for (const group of groups.values()) {
				const createdNew = await db.transaction(async (tx) => {
					// Check if a timesheet already exists for this group
					const existing = await tx
						.select()
						.from(timeSheetTable)
						.where(
							and(
								eq(timeSheetTable.associatedCandidateId, group.candidateId),
								eq(timeSheetTable.requisitionId, group.requisitionId),
								eq(timeSheetTable.weekBeginDate, group.weekBeginDate)
							)
						)
						.limit(1);

					let timesheetId: string;
					let didCreate = false;

					if (existing.length === 0) {
						// Create new timesheet
						timesheetId = crypto.randomUUID();
						await tx.insert(timeSheetTable).values({
							id: timesheetId,
							createdAt: new Date(),
							updatedAt: new Date(),
							associatedCandidateId: group.candidateId,
							associatedClientId: group.clientId,
							requisitionId: group.requisitionId,
							weekBeginDate: group.weekBeginDate,
							totalHoursWorked: '0',
							totalHoursBilled: '0',
							hoursRaw: [],
							status: 'DRAFT',
							validated: false,
							awaitingClientSignature: true
						});
						didCreate = true;
						created++;
					} else {
						timesheetId = existing[0].id;
					}

					// Link all workdays in this group to the timesheet
					for (const workdayId of group.workdayIds) {
						await tx
							.update(workdayTable)
							.set({ timesheetId, updatedAt: new Date() })
							.where(eq(workdayTable.id, workdayId));
						linked++;
					}

					return didCreate;
				});

				// Notify the candidate that they have a new draft timesheet to fill out.
				// Fire after the transaction commits so the email/SMS doesn't fire on a
				// rollback. Only on first creation, not re-link of existing timesheet.
				if (createdNew) {
					await notifyTimesheetCreated({
						candidateId: group.candidateId,
						requisitionId: group.requisitionId
					});
				}
			}

			// "Noop" from a notifications-emitted standpoint: we only fire
			// notifyTimesheetCreated when a NEW timesheet is created. If we only
			// linked workdays onto an existing draft, no notification went out.
			return json({
				success: true,
				message: `Processed ${groups.size} groups`,
				created,
				linked,
				noop: created === 0
			});
		} catch (error) {
			console.error('Error in processTimesheetCreation job:', error);
			return json({ success: false, error: String(error) }, { status: 500 });
		}
	});

	if (result === null) {
		return json({
			success: true,
			skipped: true,
			message: 'processTimesheetCreation is already running; skipping this tick'
		});
	}
	return result;
};
