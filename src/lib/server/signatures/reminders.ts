/**
 * The 30-day nudge series for unsigned documents, and the countersigner reminder.
 *
 * Same claim-then-send shape as certifications/certReminders.ts: a stage is claimed
 * in signature_request_reminders (unique per request+stage) BEFORE anything is sent,
 * so a repeated or concurrent run is a no-op rather than a duplicate SMS.
 */
import { and, eq, inArray } from 'drizzle-orm';
import db from '$lib/server/database/drizzle';
import {
	signatureRequestReminderTable,
	signatureRequestTable,
	type SignatureRequest
} from '$lib/server/database/schemas/signature';
import { logger } from '$lib/server/logger';
import { getSignatureKind } from './kinds';

/** Days after sending at which the subject is nudged. Ascending. */
export const SUBJECT_NUDGE_DAYS = [2, 5, 10, 15, 22, 29] as const;
/** Nudges that also go by SMS (if the subject accepts SMS). */
export const SMS_NUDGE_DAYS: ReadonlySet<number> = new Set([5, 15, 29]);
/** The last nudge is worded as a final notice. */
export const FINAL_NUDGE_DAY = 29;
/** Unsigned this long after sending → stop nudging, tell admins. */
export const NUDGE_WINDOW_DAYS = 30;
/** Days after the subject signs before the countersigner is reminded (once). */
export const COUNTERSIGN_REMINDER_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

export type ReminderPlan =
	| { type: 'SUBJECT'; stage: string; day: number; finalNotice: boolean; sms: boolean }
	| { type: 'COUNTERSIGN'; stage: string }
	| { type: 'EXHAUSTED'; stage: string };

export function daysSince(from: Date, now: Date): number {
	return Math.floor((now.getTime() - from.getTime()) / DAY_MS);
}

/**
 * PURE: what (if anything) is due for one request right now.
 *
 * BANDED like certReminders.stageFor: the due stage is the latest one whose day has
 * passed, so a missed cron run sends late rather than never — and a run that missed
 * several stages sends only the latest, not a burst.
 */
export function planReminder(
	row: Pick<SignatureRequest, 'status' | 'sentAt' | 'subjectSignedAt' | 'nudgesExhaustedAt'>,
	now: Date = new Date()
): ReminderPlan | null {
	if (row.status === 'AWAITING_COUNTERSIGN') {
		if (!row.subjectSignedAt) return null;
		return daysSince(row.subjectSignedAt, now) >= COUNTERSIGN_REMINDER_DAYS
			? { type: 'COUNTERSIGN', stage: `COUNTERSIGN_D${COUNTERSIGN_REMINDER_DAYS}` }
			: null;
	}

	if (row.status !== 'SENT' && row.status !== 'OPENED') return null;
	if (!row.sentAt || row.nudgesExhaustedAt) return null;

	const days = daysSince(row.sentAt, now);
	if (days >= NUDGE_WINDOW_DAYS) return { type: 'EXHAUSTED', stage: 'EXHAUSTED' };

	const day = [...SUBJECT_NUDGE_DAYS].reverse().find((d) => days >= d);
	if (day === undefined) return null;
	return {
		type: 'SUBJECT',
		stage: `D${day}`,
		day,
		finalNotice: day === FINAL_NUDGE_DAY,
		sms: SMS_NUDGE_DAYS.has(day)
	};
}

async function claim(requestId: string, stage: string, channels: string): Promise<boolean> {
	const [row] = await db
		.insert(signatureRequestReminderTable)
		.values({ requestId, stage, channels })
		.onConflictDoNothing()
		.returning({ id: signatureRequestReminderTable.id });
	return Boolean(row);
}

export async function runSignatureReminders(now: Date = new Date()): Promise<{
	scanned: number;
	sent: number;
	suppressed: number;
	exhausted: number;
	failures: number;
}> {
	const rows = await db
		.select()
		.from(signatureRequestTable)
		.where(inArray(signatureRequestTable.status, ['SENT', 'OPENED', 'AWAITING_COUNTERSIGN']));

	const {
		notifySignatureReminder,
		notifySignatureCountersign,
		notifyAdminsSignatureAlert
	} = await import('$lib/server/notifications/transactional');

	let sent = 0;
	let suppressed = 0;
	let exhausted = 0;
	let failures = 0;

	for (const row of rows) {
		const plan = planReminder(row, now);
		if (!plan) continue;

		try {
			const def = getSignatureKind(row.kind);
			const subject = await def.resolveSubject(row.subjectId);
			const organisationName = subject?.displayName ?? row.recipientName;

			if (plan.type === 'COUNTERSIGN') {
				if (!(await claim(row.id, plan.stage, 'EMAIL'))) {
					suppressed++;
					continue;
				}
				await notifySignatureCountersign({
					countersigners: row.countersigners,
					documentTitle: def.title,
					organisationName,
					reminder: true,
					auditEntityId: row.id
				});
				sent++;
				continue;
			}

			if (plan.type === 'EXHAUSTED') {
				if (!(await claim(row.id, plan.stage, 'ADMIN'))) {
					suppressed++;
					continue;
				}
				await db
					.update(signatureRequestTable)
					.set({ nudgesExhaustedAt: now, updatedAt: now })
					.where(and(eq(signatureRequestTable.id, row.id)));
				await notifyAdminsSignatureAlert({
					clientId: row.clientId,
					organisationName,
					documentTitle: def.title,
					headline: `Still unsigned after ${NUDGE_WINDOW_DAYS} days`,
					detail: `${row.recipientName} <${row.recipientEmail}> has not signed. Automatic reminders have stopped — follow up directly, or resend from the client page.`
				});
				exhausted++;
				continue;
			}

			// SUBJECT nudge.
			if (!subject || !subject.nudgeable || !row.signingUrl) {
				suppressed++;
				continue;
			}
			const channels: ('EMAIL' | 'SMS')[] = ['EMAIL'];
			if (plan.sms && subject.receiveSms && subject.phone) channels.push('SMS');

			if (!(await claim(row.id, plan.stage, channels.join('+')))) {
				suppressed++;
				continue;
			}
			await notifySignatureReminder({
				subject,
				documentTitle: def.title,
				signingUrl: row.signingUrl,
				daysOutstanding: row.sentAt ? daysSince(row.sentAt, now) : plan.day,
				finalNotice: plan.finalNotice,
				channels,
				auditEntityId: row.id
			});
			sent++;
		} catch (error) {
			failures++;
			logger.error('signatures: reminder failed', { error, requestId: row.id });
		}
	}

	return { scanned: rows.length, sent, suppressed, exhausted, failures };
}
