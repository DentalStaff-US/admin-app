import { json, type RequestHandler } from '@sveltejs/kit';
import db from '$lib/server/database/drizzle';
import {
	workdayTable,
	recurrenceDayTable,
	requisitionTable,
	timeSheetTable
} from '$lib/server/database/schemas/requisition';
import { candidateProfileTable } from '$lib/server/database/schemas/candidate';
import { clientProfileTable, clientCompanyTable } from '$lib/server/database/schemas/client';
import { and, eq, isNull, lte } from 'drizzle-orm';
import crypto from 'crypto';
import { CRON_SECRET } from '$env/static/private';
import { toZonedTime } from 'date-fns-tz';
import { TwilioService } from '$lib/server/sms/smsService';
import { userTable } from '$lib/server/database/schemas/auth';

export const GET: RequestHandler = async ({ request }) => {
	const signature = request.headers.get('x-signature');
	const expectedSignature = crypto.createHmac('sha256', CRON_SECRET).digest('hex');
	const sms = new TwilioService();

	if (signature !== expectedSignature) {
		return new Response('Invalid signature', { status: 401 });
	}

	try {
		const now = new Date();

		// Find all workdays where:
		// - timesheetId is null (not yet linked)
		// - recurrenceDay.dayStart has passed
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
			.where(and(isNull(workdayTable.timesheetId), lte(recurrenceDayTable.dayStart, now)));

		if (eligibleWorkdays.length === 0) {
			return json({
				success: true,
				message: 'No workdays to process',
				created: 0,
				linked: 0
			});
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
			await db.transaction(async (tx) => {
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

					const [candidate] = await tx
						.select({ phone: candidateProfileTable.cellPhone, name: userTable.firstName })
						.from(candidateProfileTable)
						.innerJoin(userTable, eq(userTable.id, candidateProfileTable.userId))
						.where(eq(candidateProfileTable.id, group.candidateId))
						.limit(1);

					if (candidate.phone) {
						await sms.sendTemplated(candidate.phone, 'timesheetGeneratedNotification', {
							assignedCandidate: candidate.name,
							requisitionNumber: group.requisitionId
						});
					} else {
						console.warn(
							`No phone number for candidate ${group.candidateId}, cannot send timesheet notification SMS`
						);
					}
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
			});
		}

		return json({
			success: true,
			message: `Processed ${groups.size} groups`,
			created,
			linked
		});
	} catch (error) {
		console.error('Error in processTimesheetCreation job:', error);
		return json({ success: false, error: String(error) }, { status: 500 });
	}
};
