import { json, type RequestHandler } from '@sveltejs/kit';
import db from '$lib/server/database/drizzle';
import {
	recurrenceDayTable,
	requisitionTable,
	workdayTable
} from '$lib/server/database/schemas/requisition';
import { and, eq, gte, lt } from 'drizzle-orm';
import { CRON_SECRET } from '$env/static/private';
import { candidateProfileTable } from '$lib/server/database/schemas/candidate';
import { userTable } from '$lib/server/database/schemas/auth';
import {
	clientCompanyTable,
	companyOfficeLocationTable
} from '$lib/server/database/schemas/client';
import { notifyWorkday48HrReminder } from '$lib/server/notifications/transactional';
import { disciplineTable } from '$lib/server/database/schemas/skill';
import { verifyJobRequest } from '$lib/server/jobs/sign';
import { logger } from '$lib/server/logger';

export const POST: RequestHandler = async ({ request }) => {
	const verified = verifyJobRequest(request.headers, 'processWorkday48HrReminder', CRON_SECRET);
	if (!verified.ok) {
		return new Response(`Unauthorized: ${verified.reason}`, { status: 401 });
	}

	try {
		const now = new Date();
		// Hourly cron with a 1-hour forward window so each shift lands in exactly
		// one run's window — no send-once flag needed. Reminder fires 47–48h
		// before the shift (drift bounded by cron firing time, not shift time).
		const fortySevenHoursLater = new Date(now.getTime() + 47 * 60 * 60 * 1000);
		const fortyEightHoursLater = new Date(now.getTime() + 48 * 60 * 60 * 1000);

		const upcomingWorkdays = await db
			.select({
				workday: { ...workdayTable },
				requisition: { ...requisitionTable },
				company: { ...clientCompanyTable },
				recurrenceDay: { ...recurrenceDayTable },
				location: { ...companyOfficeLocationTable },
				candidate: {
					...candidateProfileTable
				},
				user: {
					id: userTable.id,
					email: userTable.email,
					firstName: userTable.firstName,
					lastName: userTable.lastName
				},
				discipline: { ...disciplineTable }
			})
			.from(workdayTable)
			.innerJoin(requisitionTable, eq(workdayTable.requisitionId, requisitionTable.id))
			.innerJoin(recurrenceDayTable, eq(workdayTable.recurrenceDayId, recurrenceDayTable.id))
			.innerJoin(clientCompanyTable, eq(requisitionTable.companyId, clientCompanyTable.id))
			.innerJoin(
				companyOfficeLocationTable,
				eq(requisitionTable.locationId, companyOfficeLocationTable.id)
			)
			.innerJoin(candidateProfileTable, eq(workdayTable.candidateId, candidateProfileTable.id))
			.innerJoin(userTable, eq(candidateProfileTable.userId, userTable.id))
			.innerJoin(disciplineTable, eq(requisitionTable.disciplineId, disciplineTable.id))
			.where(
				and(
					eq(recurrenceDayTable.status, 'FILLED'),
					gte(recurrenceDayTable.dayStart, fortySevenHoursLater),
					lt(recurrenceDayTable.dayStart, fortyEightHoursLater)
				)
			);

		if (upcomingWorkdays.length === 0) {
			return json({ success: true, noop: true });
		}
		for (const row of upcomingWorkdays) {
			await notifyWorkday48HrReminder({
				candidateUserEmail: row.user.email,
				candidateFirstName: row.user.firstName,
				candidateLastName: row.user.lastName,
				candidatePhone: row.candidate.cellPhone,
				companyName: (row.company.companyName as string) ?? '',
				location: row.location.completeAddress || 'Not Specified',
				date: row.recurrenceDay.date,
				dayStart: row.recurrenceDay.dayStart,
				dayEnd: row.recurrenceDay.dayEnd,
				requisitionName: row.discipline.name,
				referenceTimezone: row.requisition.referenceTimezone
			});
		}
		return json({ success: true, dispatched: upcomingWorkdays.length });
	} catch (error) {
		logger.error('processWorkday48HrReminder job failed', { error });
		return json(
			{
				success: false,
				error: (error as Error).message
			},
			{ status: 500 }
		);
	}
};
