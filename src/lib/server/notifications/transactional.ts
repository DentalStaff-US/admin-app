// Transactional notification dispatchers.
//
// One async function per business event. Each dispatcher fetches the
// recipient(s), composes per-channel payloads, and fires email + SMS in
// parallel via Promise.allSettled. Failures are logged and swallowed —
// dispatchers NEVER throw to the caller. Action handlers can `await
// notifyXxx(...)` without try/catch; the calling action's success state is
// independent of notification delivery.

import { format } from 'date-fns';
import { eq } from 'drizzle-orm';
import { BASE_URL } from '$env/static/private';
import db from '$lib/server/database/drizzle';
import { sms } from '$lib/server/sms/smsService';
import { EmailService } from '$lib/server/email/emailService';
import { EMAIL_TEMPLATES } from '$lib/server/email/templates';
import {
	getRequisitionByWorkdayId,
	getRecurrenceDayByWorkdayId,
	getWorkdayById,
	getRequisitionById
} from '$lib/server/database/queries/requisitions';
import {
	getClientCompanyByClientId,
	getClientIdByCompanyId,
	getClientProfileById,
	getLocationByIdForCompany,
	getLocationContactDestinations
} from '$lib/server/database/queries/clients';
import { logger } from '$lib/server/logger';
import { getCandidateUserById } from '$lib/server/database/queries/candidates';
import { userTable } from '$lib/server/database/schemas/auth';
import {
	candidateProfileTable,
	candidateDisciplineExperienceTable
} from '$lib/server/database/schemas/candidate';
import {
	recurrenceDayTable,
	requisitionTable,
	timeSheetTable,
	workdayTable,
	type Invoice
} from '$lib/server/database/schemas/requisition';
import { disciplineTable } from '$lib/server/database/schemas/skill';
import {
	clientCompanyTable,
	clientProfileTable,
	companyOfficeLocationTable
} from '$lib/server/database/schemas/client';
import { USER_ROLES } from '$lib/config/constants';

const emailService = new EmailService();

// ---------- internal helpers ----------

type SendResult = { success?: boolean; error?: string; sid?: string; id?: string };

async function safeEmail(
	label: string,
	to: string | null | undefined,
	run: () => Promise<SendResult>
): Promise<boolean> {
	if (!to) {
		console.warn(`[transactional:${label}] email skipped: no recipient address`);
		return false;
	}
	try {
		const r = await run();
		if (r && r.success === false) {
			console.error(`[transactional:${label}] email failed (to=${to}):`, r.error);
			return false;
		}
		return true;
	} catch (e) {
		console.error(`[transactional:${label}] email threw (to=${to}):`, e);
		return false;
	}
}

async function safeSms(
	label: string,
	to: string | null | undefined,
	run: (phone: string) => Promise<SendResult>
): Promise<boolean> {
	if (!to) {
		console.warn(`[transactional:${label}] sms skipped: no phone on recipient`);
		return false;
	}
	if (!sms.isValidUSPhone(to)) {
		console.warn(`[transactional:${label}] sms skipped: phone failed normalization (got "${to}")`);
		return false;
	}
	try {
		const r = await run(to);
		if (r && r.success === false) {
			console.error(`[transactional:${label}] sms failed (to=${to}):`, r.error);
			return false;
		}
		return true;
	} catch (e) {
		console.error(`[transactional:${label}] sms threw (to=${to}):`, e);
		return false;
	}
}

async function dispatch(label: string, sends: Promise<boolean>[]): Promise<void> {
	const results = await Promise.allSettled(sends);
	const ok = results.filter((r) => r.status === 'fulfilled' && r.value === true).length;
	console.log(`[transactional:${label}] dispatched (${ok}/${results.length} channels ok)`);
	if (ok === 0 && results.length > 0) {
		console.error(`[transactional:${label}] all channels failed`);
	}
}

function fmtTime(d: Date | string | null | undefined): string {
	if (!d) return 'N/A';
	try {
		return format(new Date(d), 'h:mm a');
	} catch {
		return 'N/A';
	}
}

/**
 * Resolve the recipients for a location-scoped notification.
 *
 * Order of precedence per channel:
 *   1. Per-location contact destinations of that channel's type (fan out to all).
 *   2. The location's default email / cellPhone or companyPhone.
 *   3. None — caller silently drops the channel; we log to PostHog so missing
 *      configurations are visible in prod.
 */
async function getLocationNotificationTargets(
	locationId: string | null | undefined,
	label: string
): Promise<{ emails: string[]; phones: string[] }> {
	if (!locationId) {
		logger.event('notification.location.no_location', { label });
		return { emails: [], phones: [] };
	}

	const [locationRow, destinations] = await Promise.all([
		db
			.select({
				email: companyOfficeLocationTable.email,
				cellPhone: companyOfficeLocationTable.cellPhone,
				companyPhone: companyOfficeLocationTable.companyPhone
			})
			.from(companyOfficeLocationTable)
			.where(eq(companyOfficeLocationTable.id, locationId))
			.limit(1)
			.then((r) => r[0] ?? null),
		getLocationContactDestinations(locationId)
	]);

	let emails = destinations.filter((d) => d.type === 'EMAIL').map((d) => d.value);
	let phones = destinations.filter((d) => d.type === 'SMS').map((d) => d.value);

	if (emails.length === 0 && locationRow?.email) {
		emails = [locationRow.email];
	}
	if (phones.length === 0) {
		const fallback = locationRow?.cellPhone || locationRow?.companyPhone;
		if (fallback) phones = [fallback];
	}

	if (emails.length === 0) {
		logger.event('notification.location.no_email_destination', { label, locationId });
	}
	if (phones.length === 0) {
		logger.event('notification.location.no_sms_destination', { label, locationId });
	}

	return { emails, phones };
}

async function getDisciplineById(disciplineId: string) {
	const [d] = await db
		.select()
		.from(disciplineTable)
		.where(eq(disciplineTable.id, disciplineId))
		.limit(1);
	return d ?? null;
}

// ---------- Requisitions / Applications ----------

/**
 * Candidate has claimed a temp recurrence day — notify the client.
 * Email: recurrenceDayFilledEmail. SMS: workdayFilledNotification.
 */
export async function notifyWorkdayClaimed(workdayId: string): Promise<void> {
	const label = 'workdayClaimed';
	try {
		const workday = await getWorkdayById(workdayId);
		if (!workday) {
			console.warn(`[transactional:${label}] aborted: workday ${workdayId} not found`);
			return;
		}
		const requisition = await getRequisitionByWorkdayId(workdayId);
		if (!requisition) {
			console.warn(
				`[transactional:${label}] aborted: requisition for workday ${workdayId} not found`
			);
			return;
		}
		const recurrenceDay = await getRecurrenceDayByWorkdayId(workdayId);
		if (!recurrenceDay) {
			console.warn(
				`[transactional:${label}] aborted: recurrence day for workday ${workdayId} not found`
			);
			return;
		}

		const candidateUser = await getCandidateUserById(workday.candidateId);
		const clientId = await getClientIdByCompanyId(requisition.companyId);
		const company = await getClientCompanyByClientId(clientId);
		const client = await getClientProfileById(clientId);
		if (!client) {
			console.warn(`[transactional:${label}] aborted: client profile ${clientId} not found`);
			return;
		}
		const location = await getLocationByIdForCompany(requisition.locationId, requisition.companyId);
		const discipline = await getDisciplineById(requisition.disciplineId);
		const { emails, phones } = await getLocationNotificationTargets(requisition.locationId, label);

		const candidateName = `${candidateUser.firstName} ${candidateUser.lastName}`;
		const url = `${BASE_URL}/requisitions/${requisition.id}/workday/${recurrenceDay.id}`;

		await dispatch('workdayClaimed', [
			...emails.map((to) =>
				safeEmail('workdayClaimed', to, () =>
					emailService.sendRecurrenceDayClaimedEmail(
						to,
						{
							url,
							companyName: (company?.companyName as string) ?? 'your company',
							location: location?.completeAddress ?? 'Not Specified',
							date: recurrenceDay.date,
							workdayStart: fmtTime(recurrenceDay.dayStart),
							workdayEnd: fmtTime(recurrenceDay.dayEnd),
							discipline: discipline?.name ?? `Req #${requisition.id}`
						},
						{ firstName: candidateUser.firstName, lastName: candidateUser.lastName }
					)
				)
			),
			...phones.map((phone) =>
				safeSms('workdayClaimed', phone, (p) =>
					sms.sendTemplated(p, 'workdayFilledNotification', {
						assignedCandidate: candidateName,
						requisitionName: discipline?.name ?? `Req #${requisition.id}`,
						scheduledDate: recurrenceDay.date
					})
				)
			)
		]);
	} catch (e) {
		console.error('[transactional:workdayClaimed] top-level error:', e);
	}
}

/**
 * Candidate cancelled a workday they had claimed — notify the client.
 * Email: workdayRepostedNotificationEmail. SMS: workdayRepostedNotification.
 *
 * Accepts the recurrenceDayId because by the time we send, the workday row
 * has already been deleted and `existingWorkday` is the pre-delete copy.
 */
export async function notifyWorkdayReposted(args: {
	candidateId: string;
	requisitionId: number;
	recurrenceDayId: string;
}): Promise<void> {
	const label = 'workdayReposted';
	try {
		const requisition = await getRequisitionById(args.requisitionId);
		if (!requisition) {
			console.warn(`[transactional:${label}] aborted: requisition ${args.requisitionId} not found`);
			return;
		}
		const [recurrenceDay] = await db
			.select()
			.from(recurrenceDayTable)
			.where(eq(recurrenceDayTable.id, args.recurrenceDayId))
			.limit(1);
		if (!recurrenceDay) {
			console.warn(
				`[transactional:${label}] aborted: recurrence day ${args.recurrenceDayId} not found`
			);
			return;
		}

		const candidateUser = await getCandidateUserById(args.candidateId);
		const clientId = await getClientIdByCompanyId(requisition.companyId);
		const company = await getClientCompanyByClientId(clientId);
		const client = await getClientProfileById(clientId);
		if (!client) {
			console.warn(`[transactional:${label}] aborted: client profile ${clientId} not found`);
			return;
		}
		const location = await getLocationByIdForCompany(requisition.locationId, requisition.companyId);
		const discipline = await getDisciplineById(requisition.disciplineId);
		const { emails, phones } = await getLocationNotificationTargets(requisition.locationId, label);

		const candidateName = `${candidateUser.firstName} ${candidateUser.lastName}`;
		const clientName = `${client.user.firstName} ${client.user.lastName}`;
		const url = `${BASE_URL}/requisitions/${requisition.id}/workday/${recurrenceDay.id}`;

		await dispatch('workdayReposted', [
			...emails.map((to) =>
				safeEmail('workdayReposted', to, () => {
					const t = EMAIL_TEMPLATES.workdayRepostedNotificationEmail({
						clientName,
						companyName: (company?.companyName as string) ?? '',
						location: location?.completeAddress ?? 'Not Specified',
						date: recurrenceDay.date,
						workdayStart: fmtTime(recurrenceDay.dayStart),
						workdayEnd: fmtTime(recurrenceDay.dayEnd),
						candidateName,
						discipline: discipline?.name ?? `Req #${requisition.id}`,
						url
					});
					return emailService.sendEmail({
						to: [{ email: to }],
						subject: t.subject,
						html: t.htmlEmail,
						text: t.textEmail
					});
				})
			),
			...phones.map((phone) =>
				safeSms('workdayReposted', phone, (p) =>
					sms.sendTemplated(p, 'workdayRepostedNotification', {
						assignedCandidate: candidateName,
						scheduledDate: recurrenceDay.date,
						requisitionNumber: requisition.id,
						clientName
					})
				)
			)
		]);
	} catch (e) {
		console.error('[transactional:workdayReposted] top-level error:', e);
	}
}

/**
 * Requisition was cancelled — SMS every candidate who had claimed an open
 * recurrence day on it. (No matching email template exists.)
 */
export async function notifyRequisitionCancelled(requisitionId: number): Promise<void> {
	try {
		const candidates = await db
			.selectDistinct({
				candidateId: workdayTable.candidateId,
				phone: candidateProfileTable.cellPhone,
				firstName: userTable.firstName,
				lastName: userTable.lastName
			})
			.from(workdayTable)
			.innerJoin(candidateProfileTable, eq(workdayTable.candidateId, candidateProfileTable.id))
			.innerJoin(userTable, eq(candidateProfileTable.userId, userTable.id))
			.where(eq(workdayTable.requisitionId, requisitionId));

		if (candidates.length === 0) return;

		await dispatch(
			'requisitionCancelled',
			candidates.map((c) =>
				safeSms('requisitionCancelled', c.phone, (phone) =>
					sms.sendTemplated(phone, 'requisitionCancelledNotification', {
						requisitionNumber: requisitionId,
						associatedCandidate: `${c.firstName} ${c.lastName}`
					})
				)
			)
		);
	} catch (e) {
		console.error('[transactional:requisitionCancelled] top-level error:', e);
	}
}

/**
 * Requisition fields changed materially — SMS every candidate with a workday
 * on it. (No matching email template exists.)
 */
export async function notifyRequisitionChanged(requisitionId: number): Promise<void> {
	try {
		const candidates = await db
			.selectDistinct({
				phone: candidateProfileTable.cellPhone
			})
			.from(workdayTable)
			.innerJoin(candidateProfileTable, eq(workdayTable.candidateId, candidateProfileTable.id))
			.where(eq(workdayTable.requisitionId, requisitionId));

		if (candidates.length === 0) return;

		await dispatch(
			'requisitionChanged',
			candidates.map((c) =>
				safeSms('requisitionChanged', c.phone, (phone) =>
					sms.sendTemplated(phone, 'requisitionChangeNotification', {
						requisitionNumber: requisitionId
					})
				)
			)
		);
	} catch (e) {
		console.error('[transactional:requisitionChanged] top-level error:', e);
	}
}

/**
 * New recurrence days posted on a requisition — fan out to qualified
 * candidates near the location with the matching discipline.
 * Email: qualifiedCandidateNotificationEmail. SMS: newRequisitionNotification.
 */
export async function notifyQualifiedCandidatesOfNewWorkdays(requisitionId: number): Promise<void> {
	try {
		const requisition = await getRequisitionById(requisitionId);
		if (!requisition) return;
		const location = await getLocationByIdForCompany(requisition.locationId, requisition.companyId);
		if (!location) return;
		const discipline = await getDisciplineById(requisition.disciplineId);

		// Inline qualified-candidate match (mirrors getQualifiedProfessionalsForRequisition
		// without the geo radius filter — keep this simple; we only need contacts).
		const candidates = await db
			.selectDistinct({
				phone: candidateProfileTable.cellPhone,
				email: userTable.email,
				firstName: userTable.firstName,
				lastName: userTable.lastName
			})
			.from(candidateProfileTable)
			.innerJoin(userTable, eq(userTable.id, candidateProfileTable.userId))
			.innerJoin(
				candidateDisciplineExperienceTable,
				eq(candidateDisciplineExperienceTable.candidateId, candidateProfileTable.id)
			)
			.where(eq(candidateDisciplineExperienceTable.disciplineId, requisition.disciplineId));

		if (candidates.length === 0) return;

		// Build the email payload once
		const workdayDetails = {
			companyName: '', // not in scope for this template per existing usage
			discipline: discipline?.name ?? '',
			location: location.name ?? '',
			date: 'soon',
			workdayStart: '',
			workdayEnd: '',
			experience: '',
			address: location.completeAddress ?? ''
		};

		await dispatch(
			'qualifiedCandidatesNewWorkdays',
			candidates.flatMap((c) => {
				const sends: Promise<boolean>[] = [];
				if (c.email) {
					sends.push(
						safeEmail('qualifiedCandidatesNewWorkdays', c.email, () => {
							const t = EMAIL_TEMPLATES.qualifiedCandidateNotificationEmail(
								{ firstName: c.firstName, lastName: c.lastName },
								workdayDetails
							);
							return emailService.sendEmail({
								to: [{ email: c.email }],
								subject: t.subject,
								html: t.htmlEmail,
								text: t.textEmail
							});
						})
					);
				}
				sends.push(
					safeSms('qualifiedCandidatesNewWorkdays', c.phone, (phone) =>
						sms.sendTemplated(phone, 'newRequisitionNotification')
					)
				);
				return sends;
			})
		);
	} catch (e) {
		console.error('[transactional:qualifiedCandidatesNewWorkdays] top-level error:', e);
	}
}

/**
 * A recurrence day's time/date was edited — SMS the candidate already
 * assigned to it. (No matching email template exists.)
 */
export async function notifyWorkdayChanged(recurrenceDayId: string): Promise<void> {
	try {
		const [row] = await db
			.select({
				requisitionId: workdayTable.requisitionId,
				phone: candidateProfileTable.cellPhone,
				date: recurrenceDayTable.date
			})
			.from(workdayTable)
			.innerJoin(candidateProfileTable, eq(workdayTable.candidateId, candidateProfileTable.id))
			.innerJoin(recurrenceDayTable, eq(workdayTable.recurrenceDayId, recurrenceDayTable.id))
			.where(eq(workdayTable.recurrenceDayId, recurrenceDayId))
			.limit(1);

		if (!row) return;

		await dispatch('workdayChanged', [
			safeSms('workdayChanged', row.phone, (phone) =>
				sms.sendTemplated(phone, 'workdayChangeNotification', {
					requisitionNumber: row.requisitionId,
					scheduledDate: row.date
				})
			)
		]);
	} catch (e) {
		console.error('[transactional:workdayChanged] top-level error:', e);
	}
}

/**
 * A recurrence day was deleted — email the candidate who was assigned to it.
 * (No matching SMS template exists.)
 *
 * Accepts a snapshot taken BEFORE the delete because the workday row may be
 * gone by the time this is invoked.
 */
export async function notifyWorkdayDeleted(args: {
	candidateId: string;
	requisitionId: number;
	recurrenceDay: {
		date: string;
		dayStart: Date | string;
		dayEnd: Date | string;
	};
}): Promise<void> {
	try {
		const requisition = await getRequisitionById(args.requisitionId);
		if (!requisition) return;
		const candidateUser = await getCandidateUserById(args.candidateId);
		const clientId = await getClientIdByCompanyId(requisition.companyId);
		const company = await getClientCompanyByClientId(clientId);
		const location = await getLocationByIdForCompany(requisition.locationId, requisition.companyId);

		await dispatch('workdayDeleted', [
			safeEmail('workdayDeleted', candidateUser.email, () =>
				emailService.sendWorkdayCancelledEmail(candidateUser.email, {
					companyName: (company?.companyName as string) ?? '',
					location: location?.completeAddress ?? 'Not Specified',
					date: args.recurrenceDay.date,
					workdayStart: fmtTime(args.recurrenceDay.dayStart),
					workdayEnd: fmtTime(args.recurrenceDay.dayEnd)
				})
			)
		]);
	} catch (e) {
		console.error('[transactional:workdayDeleted] top-level error:', e);
	}
}

// ---------- Workdays / Shifts ----------

/**
 * 48-hour pre-shift reminder — email AND SMS the candidate.
 */
export async function notifyWorkday48HrReminder(args: {
	candidateUserEmail: string;
	candidateFirstName: string;
	candidateLastName: string;
	candidatePhone: string | null;
	companyName: string;
	location: string;
	date: string;
	dayStart: Date | string;
	dayEnd: Date | string;
	requisitionName: string;
}): Promise<void> {
	try {
		const startStr = fmtTime(args.dayStart);
		const endStr = fmtTime(args.dayEnd);

		await dispatch('workday48HrReminder', [
			safeEmail('workday48HrReminder', args.candidateUserEmail, () =>
				emailService.sendWorkdayReminderEmail(args.candidateUserEmail, {
					companyName: args.companyName,
					location: args.location,
					date: args.date,
					workdayStart: startStr,
					workdayEnd: endStr
				})
			),
			safeSms('workday48HrReminder', args.candidatePhone, (phone) =>
				sms.sendTemplated(phone, 'workday48HrReminderNotification', {
					assignedCandidate: `${args.candidateFirstName} ${args.candidateLastName}`,
					scheduledDate: args.date,
					requisitionName: args.requisitionName
				})
			)
		]);
	} catch (e) {
		console.error('[transactional:workday48HrReminder] top-level error:', e);
	}
}

// ---------- Timesheets ----------

/**
 * Candidate (or admin acting on their behalf) submitted a timesheet for
 * client review — email the client. (No matching SMS template.)
 */
export async function notifyTimesheetSubmitted(timesheetId: string): Promise<void> {
	try {
		const [row] = await db
			.select({
				timesheet: timeSheetTable,
				clientUser: {
					firstName: userTable.firstName,
					lastName: userTable.lastName,
					email: userTable.email
				},
				company: { companyName: clientCompanyTable.companyName },
				requisition: requisitionTable,
				candidateFirstName: userTable.firstName,
				candidateLastName: userTable.lastName
			})
			.from(timeSheetTable)
			.innerJoin(clientProfileTable, eq(timeSheetTable.associatedClientId, clientProfileTable.id))
			.innerJoin(userTable, eq(clientProfileTable.userId, userTable.id))
			.innerJoin(clientCompanyTable, eq(clientCompanyTable.clientId, clientProfileTable.id))
			.innerJoin(requisitionTable, eq(timeSheetTable.requisitionId, requisitionTable.id))
			.where(eq(timeSheetTable.id, timesheetId))
			.limit(1);

		if (!row) return;

		// Pull candidate name separately to avoid the userTable join collision above
		const [cand] = await db
			.select({ firstName: userTable.firstName, lastName: userTable.lastName })
			.from(candidateProfileTable)
			.innerJoin(userTable, eq(userTable.id, candidateProfileTable.userId))
			.where(eq(candidateProfileTable.id, row.timesheet.associatedCandidateId))
			.limit(1);

		const discipline = await getDisciplineById(row.requisition.disciplineId);
		const location = await getLocationByIdForCompany(
			row.requisition.locationId,
			row.requisition.companyId
		);

		const timesheetUrl = `${BASE_URL}/timesheets/${timesheetId}`;

		await dispatch('timesheetSubmitted', [
			safeEmail('timesheetSubmitted', row.clientUser.email, () => {
				const t = EMAIL_TEMPLATES.timesheetVerificationNotificationEmail(
					{ firstName: cand?.firstName ?? '', lastName: cand?.lastName ?? '' },
					{
						timesheetUrl,
						clientName: `${row.clientUser.firstName} ${row.clientUser.lastName}`,
						discipline: discipline?.name ?? '',
						location: location?.completeAddress ?? '',
						date: row.timesheet.weekBeginDate,
						workdayStart: '',
						workdayEnd: '',
						requisitionNumber: String(row.requisition.id)
					}
				);
				return emailService.sendEmail({
					to: [{ email: row.clientUser.email }],
					subject: t.subject,
					html: t.htmlEmail || `<p>${t.textEmail.replace(/\n/g, '<br>')}</p>`,
					text: t.textEmail
				});
			})
		]);
	} catch (e) {
		console.error('[transactional:timesheetSubmitted] top-level error:', e);
	}
}

/**
 * A weekly timesheet row was just created for a candidate — SMS them so
 * they know to fill it out. (No matching email template.)
 */
export async function notifyTimesheetCreated(args: {
	candidateId: string;
	requisitionId: number;
}): Promise<void> {
	try {
		const [row] = await db
			.select({
				phone: candidateProfileTable.cellPhone,
				firstName: userTable.firstName
			})
			.from(candidateProfileTable)
			.innerJoin(userTable, eq(userTable.id, candidateProfileTable.userId))
			.where(eq(candidateProfileTable.id, args.candidateId))
			.limit(1);

		if (!row) return;

		await dispatch('timesheetCreated', [
			safeSms('timesheetCreated', row.phone, (phone) =>
				sms.sendTemplated(phone, 'timesheetGeneratedNotification', {
					assignedCandidate: row.firstName,
					requisitionNumber: args.requisitionId
				})
			)
		]);
	} catch (e) {
		console.error('[transactional:timesheetCreated] top-level error:', e);
	}
}

// ---------- Invoices / Billing ----------

/**
 * Stripe invoice was processed — email the client a receipt-style note.
 */
export async function notifyInvoicePaymentProcessed(invoiceId: string): Promise<void> {
	try {
		const invRow = await getInvoiceCoreFields(invoiceId);
		if (!invRow) return;
		const client = await getClientContactById(invRow.clientId);
		if (!client) return;

		await dispatch('invoicePaymentProcessed', [
			safeEmail('invoicePaymentProcessed', client.email, () => {
				const t = EMAIL_TEMPLATES.invoicePaymentProcessedNotificationEmail({
					clientName: `${client.firstName} ${client.lastName}`,
					requisitionNumber: invRow.requisitionId ? String(invRow.requisitionId) : 'N/A',
					transactionAmount: `$${invRow.amount}`
				});
				return emailService.sendEmail({
					to: [{ email: client.email }],
					subject: t.subject,
					html: t.htmlEmail,
					text: t.textEmail
				});
			})
		]);
	} catch (e) {
		console.error('[transactional:invoicePaymentProcessed] top-level error:', e);
	}
}

/**
 * Manual paper transaction recorded against an invoice — email the client.
 */
export async function notifyMiscellaneousTransaction(args: {
	invoiceId: string;
	transactionType: 'PAYMENT' | 'REFUND' | 'ADJUSTMENT';
	amount: number;
	notes?: string | null;
}): Promise<void> {
	try {
		const invRow = await getInvoiceCoreFields(args.invoiceId);
		if (!invRow) return;
		const client = await getClientContactById(invRow.clientId);
		if (!client) return;

		await dispatch('miscellaneousTransaction', [
			safeEmail('miscellaneousTransaction', client.email, () => {
				const t = EMAIL_TEMPLATES.miscelaneousTransactionNotificationEmail({
					clientName: `${client.firstName} ${client.lastName}`,
					transactionAmount: `$${args.amount.toFixed(2)}`,
					transactionType: args.transactionType,
					transactionReason: args.notes ?? 'No reason provided'
				});
				return emailService.sendEmail({
					to: [{ email: client.email }],
					subject: t.subject,
					html: t.htmlEmail,
					text: t.textEmail
				});
			})
		]);
	} catch (e) {
		console.error('[transactional:miscellaneousTransaction] top-level error:', e);
	}
}

/**
 * Overdue invoice reminder — email the client. (No matching SMS template.)
 */
export async function notifyOverdueInvoice(invoice: Invoice): Promise<void> {
	try {
		const recipient = invoice.customerEmail;
		if (!recipient) {
			console.warn('[transactional:overdueInvoice] no customer email on invoice', invoice.id);
			return;
		}
		await dispatch('overdueInvoice', [
			safeEmail('overdueInvoice', recipient, () =>
				emailService.sendOverdueInvoiceReminderEmail(recipient, invoice)
			)
		]);
	} catch (e) {
		console.error('[transactional:overdueInvoice] top-level error:', e);
	}
}

// ---------- Support ----------

/**
 * New support ticket — email every SUPERADMIN.
 */
export async function notifySupportTicketCreated(): Promise<void> {
	try {
		const admins = await db
			.select({ email: userTable.email })
			.from(userTable)
			.where(eq(userTable.role, USER_ROLES.SUPERADMIN));

		const recipients = admins.filter((a) => !!a.email);
		if (recipients.length === 0) return;

		const t = EMAIL_TEMPLATES.supportTicketSubmissionNotificationEmail();

		await dispatch(
			'supportTicketCreated',
			recipients.map((a) =>
				safeEmail('supportTicketCreated', a.email, () =>
					emailService.sendEmail({
						to: [{ email: a.email }],
						subject: t.subject,
						html: t.htmlEmail,
						text: t.textEmail
					})
				)
			)
		);
	} catch (e) {
		console.error('[transactional:supportTicketCreated] top-level error:', e);
	}
}

// ---------- shared private helpers ----------

async function getClientContactById(
	clientId: string
): Promise<{ email: string; firstName: string; lastName: string } | null> {
	const [row] = await db
		.select({
			email: userTable.email,
			firstName: userTable.firstName,
			lastName: userTable.lastName
		})
		.from(clientProfileTable)
		.innerJoin(userTable, eq(clientProfileTable.userId, userTable.id))
		.where(eq(clientProfileTable.id, clientId))
		.limit(1);
	return row ?? null;
}

async function getInvoiceCoreFields(invoiceId: string) {
	const { invoiceTable } = await import('$lib/server/database/schemas/requisition');
	const [row] = await db
		.select({
			id: invoiceTable.id,
			clientId: invoiceTable.clientId,
			requisitionId: invoiceTable.requisitionId,
			amount: invoiceTable.total,
			customerEmail: invoiceTable.customerEmail
		})
		.from(invoiceTable)
		.where(eq(invoiceTable.id, invoiceId))
		.limit(1);
	return row ?? null;
}
