/**
 * Compliance page actions: remind a professional, snooze / un-snooze an item.
 *
 * Every action re-reads the item through `getComplianceItems()` instead of trusting
 * the posted state, so a reminder always describes the credential as it is now and
 * a resolved item can't be acted on.
 */

import db from '$lib/server/database/drizzle';
import { and, eq, gte, sql } from 'drizzle-orm';
import { addDays, format, parseISO } from 'date-fns';
import { userTable } from '$lib/server/database/schemas/auth';
import {
	candidateLicenseGraceTable,
	candidateProfileTable
} from '$lib/server/database/schemas/candidate';
import { actionHistoryTable, complianceSnoozeTable } from '$lib/server/database/schemas/admin';
import { recordAction } from '$lib/server/audit/audit';
import {
	daysUntil,
	LICENSE_GRACE_DAYS,
	todayInET
} from '$lib/server/certifications/credentialStatus';
import { SMS_STAGES, stageFor } from '$lib/server/certifications/certReminders';
import {
	notifyCertExpiring,
	notifyLicenseGraceExpired,
	notifyLicenseMissing
} from '$lib/server/notifications/transactional';
import { getComplianceItems, REMINDER_THROTTLE_MS } from '$lib/server/compliance/queries';
import type { ComplianceItem } from '$lib/server/compliance/complianceRule';

import { SNOOZE_DAYS } from '$lib/config/compliance';

export type ComplianceActionResult = { ok: true; message: string } | { ok: false; status: number; message: string };

async function findItem(subjectId: string, ruleKey: string): Promise<ComplianceItem | null> {
	const items = await getComplianceItems();
	return (
		items.find(
			(i) => i.subjectType === 'PROFESSIONAL' && i.subjectId === subjectId && i.ruleKey === ruleKey
		) ?? null
	);
}

/**
 * Send the right message for one professional's one credential:
 *   - dated (expiring / expired)   → the expiry-series message for its stage;
 *   - missing license, in grace    → start the grace clock (never moves it) + missing email;
 *   - missing license, grace over  → the "your shifts are hidden" message.
 * Throttled to one per item per REMINDER_THROTTLE_MS. The audit row is claimed under
 * an advisory lock BEFORE sending, so a double-click can't send twice.
 */
export async function sendComplianceReminder(args: {
	candidateId: string;
	ruleKey: string;
	actorUserId: string;
}): Promise<ComplianceActionResult> {
	const item = await findItem(args.candidateId, args.ruleKey);
	if (!item || !item.credential) {
		return { ok: false, status: 404, message: 'This item is already resolved.' };
	}
	if (!item.remindable) {
		return {
			ok: false,
			status: 400,
			message: 'There is no reminder for a certification with no date — fix it on the profile.'
		};
	}
	const cred = item.credential;

	const [contact] = await db
		.select({
			email: userTable.email,
			firstName: userTable.firstName,
			receiveSms: userTable.receiveSms,
			phone: candidateProfileTable.cellPhone
		})
		.from(candidateProfileTable)
		.innerJoin(userTable, eq(userTable.id, candidateProfileTable.userId))
		.where(eq(candidateProfileTable.id, args.candidateId))
		.limit(1);
	if (!contact?.email) {
		return { ok: false, status: 400, message: 'This professional has no email on file.' };
	}

	const today = todayInET();
	const [disciplineName, abbreviation] = splitLabel(cred.disciplineLabel);
	let kind: 'EXPIRY' | 'MISSING' | 'GRACE_EXPIRED';
	let stage: ReturnType<typeof stageFor> = null;
	let channels: ('EMAIL' | 'SMS')[] = ['EMAIL'];

	if (cred.expiresOn) {
		kind = 'EXPIRY';
		stage = stageFor(daysUntil(cred.expiresOn, today)) ?? 'D60';
		if (SMS_STAGES.has(stage) && contact.receiveSms && contact.phone) channels = ['EMAIL', 'SMS'];
	} else if (cred.state === 'EXPIRED') {
		kind = 'GRACE_EXPIRED';
		if (contact.receiveSms && contact.phone) channels = ['EMAIL', 'SMS'];
	} else {
		kind = 'MISSING';
	}

	// Claim the reminder: lock this item, re-check the throttle, write the audit row.
	const claimed = await db.transaction(async (tx) => {
		await tx.execute(
			sql`select pg_advisory_xact_lock(hashtext(${`compliance-remind:${args.candidateId}:${args.ruleKey}`}))`
		);
		const [recent] = await tx
			.select({ id: actionHistoryTable.id })
			.from(actionHistoryTable)
			.where(
				and(
					eq(actionHistoryTable.action, 'REMIND'),
					eq(actionHistoryTable.entityId, args.candidateId),
					sql`${actionHistoryTable.metadata}->>'ruleKey' = ${args.ruleKey}`,
					gte(actionHistoryTable.createdAt, new Date(Date.now() - REMINDER_THROTTLE_MS))
				)
			)
			.limit(1);
		if (recent) return false;

		await recordAction({
			tx,
			entityType: 'CANDIDATES',
			entityId: args.candidateId,
			action: 'REMIND',
			actor: args.actorUserId,
			metadata: { ruleKey: args.ruleKey, track: cred.track, state: cred.state, kind, stage, channels }
		});
		return true;
	});
	if (!claimed) {
		return { ok: false, status: 409, message: 'A reminder for this was already sent in the last 24 hours.' };
	}

	if (kind === 'EXPIRY' && stage) {
		await notifyCertExpiring({
			email: contact.email,
			phone: contact.phone,
			firstName: contact.firstName,
			disciplineName,
			abbreviation,
			expiresOn: cred.expiresOn as string,
			daysUntil: daysUntil(cred.expiresOn as string, today),
			stage,
			track: cred.track,
			channels
		});
	} else if (kind === 'GRACE_EXPIRED') {
		// Stamp like runMissingCredentialNudge does, so the job doesn't send it again.
		await db
			.update(candidateLicenseGraceTable)
			.set({ blockedNotifiedAt: new Date() })
			.where(
				and(
					eq(candidateLicenseGraceTable.candidateId, args.candidateId),
					eq(candidateLicenseGraceTable.disciplineId, cred.disciplineId)
				)
			);
		await notifyLicenseGraceExpired({
			email: contact.email,
			phone: contact.phone,
			firstName: contact.firstName,
			disciplineName,
			abbreviation,
			receiveSms: contact.receiveSms ?? false
		});
	} else {
		// Start the clock if it isn't running. ON CONFLICT DO NOTHING: a reminder must
		// never move an existing deadline (same rule as runMissingCredentialNudge).
		await db
			.insert(candidateLicenseGraceTable)
			.values({ candidateId: args.candidateId, disciplineId: cred.disciplineId })
			.onConflictDoNothing();
		const [grace] = await db
			.select({ notifiedAt: candidateLicenseGraceTable.notifiedAt })
			.from(candidateLicenseGraceTable)
			.where(
				and(
					eq(candidateLicenseGraceTable.candidateId, args.candidateId),
					eq(candidateLicenseGraceTable.disciplineId, cred.disciplineId)
				)
			)
			.limit(1);
		// The gate dates the clock by notified_at's UTC date (credentialGateSql
		// graceStartedOnSql); the deadline in the email must match it exactly.
		const started = grace?.notifiedAt ? grace.notifiedAt.toISOString().slice(0, 10) : today;
		await notifyLicenseMissing({
			email: contact.email,
			firstName: contact.firstName,
			disciplineName,
			abbreviation,
			deadline: format(addDays(parseISO(started), LICENSE_GRACE_DAYS), 'yyyy-MM-dd')
		});
	}

	return { ok: true, message: `Reminder sent to ${item.subjectName}.` };
}

/** 'Registered Dental Hygienist (RDH)' → ['Registered Dental Hygienist', 'RDH']. */
function splitLabel(label: string): [string, string] {
	const m = label.match(/^(.*) \(([^)]+)\)$/);
	return m ? [m[1], m[2]] : [label, label];
}

export async function snoozeComplianceItem(args: {
	candidateId: string;
	ruleKey: string;
	days: number;
	note: string | null;
	actorUserId: string;
}): Promise<ComplianceActionResult> {
	if (!(SNOOZE_DAYS as readonly number[]).includes(args.days)) {
		return { ok: false, status: 400, message: 'Choose 7, 14 or 30 days.' };
	}
	const item = await findItem(args.candidateId, args.ruleKey);
	if (!item) return { ok: false, status: 404, message: 'This item is already resolved.' };
	if (item.severity === 'CRITICAL') {
		return {
			ok: false,
			status: 400,
			message: 'An expired credential on a booked shift can’t be snoozed — fix the shifts first.'
		};
	}

	const snoozedUntil = format(addDays(parseISO(todayInET()), args.days), 'yyyy-MM-dd');
	await db.transaction(async (tx) => {
		await tx
			.insert(complianceSnoozeTable)
			.values({
				id: crypto.randomUUID(),
				subjectType: 'PROFESSIONAL',
				subjectId: args.candidateId,
				ruleKey: args.ruleKey,
				snoozedUntil,
				note: args.note,
				createdByUserId: args.actorUserId
			})
			.onConflictDoUpdate({
				target: [
					complianceSnoozeTable.subjectType,
					complianceSnoozeTable.subjectId,
					complianceSnoozeTable.ruleKey
				],
				set: {
					snoozedUntil,
					note: args.note,
					createdByUserId: args.actorUserId,
					createdAt: new Date()
				}
			});
		await recordAction({
			tx,
			entityType: 'CANDIDATES',
			entityId: args.candidateId,
			action: 'SNOOZE',
			actor: args.actorUserId,
			metadata: { ruleKey: args.ruleKey, snoozedUntil, note: args.note }
		});
	});
	return { ok: true, message: `Snoozed until ${snoozedUntil}.` };
}

export async function unsnoozeComplianceItem(args: {
	candidateId: string;
	ruleKey: string;
	actorUserId: string;
}): Promise<ComplianceActionResult> {
	await db.transaction(async (tx) => {
		await tx
			.delete(complianceSnoozeTable)
			.where(
				and(
					eq(complianceSnoozeTable.subjectType, 'PROFESSIONAL'),
					eq(complianceSnoozeTable.subjectId, args.candidateId),
					eq(complianceSnoozeTable.ruleKey, args.ruleKey)
				)
			);
		await recordAction({
			tx,
			entityType: 'CANDIDATES',
			entityId: args.candidateId,
			action: 'UNSNOOZE',
			actor: args.actorUserId,
			metadata: { ruleKey: args.ruleKey }
		});
	});
	return { ok: true, message: 'Snooze removed.' };
}
