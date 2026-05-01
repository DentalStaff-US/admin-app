import { json, type RequestHandler } from '@sveltejs/kit';
import db from '$lib/server/database/drizzle';
import {
	recurrenceDayTable,
	requisitionTable,
	workdayTable
} from '$lib/server/database/schemas/requisition';
import { and, eq, lt, gt } from 'drizzle-orm';
import crypto from 'crypto';
import { CRON_SECRET } from '$env/static/private';
import { candidateProfileTable } from '$lib/server/database/schemas/candidate';
import { userTable } from '$lib/server/database/schemas/auth';
import {
	clientCompanyTable,
	companyOfficeLocationTable
} from '$lib/server/database/schemas/client';
import { notifyWorkday48HrReminder } from '$lib/server/notifications/transactional';
import { disciplineTable } from '$lib/server/database/schemas/skill';

export const GET: RequestHandler = async ({ request }) => {
	const signature = request.headers.get('x-signature');
	const expectedSignature = crypto.createHmac('sha256', CRON_SECRET).digest('hex');

	if (signature !== expectedSignature) {
		return new Response('Invalid signature', { status: 401 });
	}

	try {
		const now = new Date();
		const fortyEightHoursLater = new Date(now.getTime() + 48 * 60 * 60 * 1000); // Add 48 hours to the current time

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
				eq(requisitionTable.companyId, companyOfficeLocationTable.companyId)
			)
			.innerJoin(candidateProfileTable, eq(workdayTable.candidateId, candidateProfileTable.id))
			.innerJoin(userTable, eq(candidateProfileTable.userId, userTable.id))
			.innerJoin(disciplineTable, eq(requisitionTable.disciplineId, disciplineTable.id))
			.where(
				and(
					eq(recurrenceDayTable.status, 'OPEN'),
					lt(recurrenceDayTable.date, fortyEightHoursLater.toISOString()), // Filter recurrence days less than 48 hours away
					gt(recurrenceDayTable.date, now.toISOString()) // Ensure the date is in the future
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
