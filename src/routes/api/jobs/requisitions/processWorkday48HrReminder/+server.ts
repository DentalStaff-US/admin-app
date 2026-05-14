import { json, type RequestHandler } from '@sveltejs/kit';
import db from '$lib/server/database/drizzle';
import {
	recurrenceDayTable,
	requisitionTable,
	workdayTable
} from '$lib/server/database/schemas/requisition';
import { and, eq, lt, gt } from 'drizzle-orm';
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

export const POST: RequestHandler = async ({ request }) => {
	const verified = verifyJobRequest(request.headers, 'processWorkday48HrReminder', CRON_SECRET);
	if (!verified.ok) {
		return new Response(`Unauthorized: ${verified.reason}`, { status: 401 });
	}

	try {
		const now = new Date();
		// Window is [now+24h, now+48h) so each shift enters the window on exactly
		// one daily run — preventing a duplicate reminder the day after, since the
		// cron fires daily at 6am ET with no send-once flag.
		const twentyFourHoursLater = new Date(now.getTime() + 24 * 60 * 60 * 1000);
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
					gt(recurrenceDayTable.dayStart, twentyFourHoursLater),
					lt(recurrenceDayTable.dayStart, fortyEightHoursLater)
				)
			);

		if (upcomingWorkdays.length === 0) {
			console.log('No upcoming workdays found within the next 48 hours.');
			return json({ success: true, message: 'No upcoming workdays found.' });
		}
		console.log(`Found ${upcomingWorkdays.length} upcoming workdays within the next 48 hours.`);
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
				requisitionName: row.discipline.name
			});
		}
		return json({ success: true });
	} catch (error) {
		return json(
			{
				success: false,
				error: (error as Error).message
			},
			{ status: 500 }
		);
	}
};
