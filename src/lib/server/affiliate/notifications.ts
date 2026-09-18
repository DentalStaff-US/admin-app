/**
 * Affiliate program emails.
 *
 * Kept in the affiliate domain rather than added to the shared EmailService /
 * transactional.ts, which are already very large. Same contract as those:
 * NEVER throws — a notification failure must not fail a payout run, a webhook,
 * or a signup. Every send is logged with its outcome.
 *
 * Recipients opt out via users.receive_email, same as every other email.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { format } from 'date-fns';
import db from '$lib/server/database/drizzle';
import { userTable } from '$lib/server/database/schemas/auth';
import { affiliateProfileTable } from '$lib/server/database/schemas/affiliate';
import { EmailService } from '$lib/server/email/emailService';
import { APP_NAME, USER_ROLES, DOMAIN } from '$lib/config/constants';
import { PARTNER_PORTAL_URL } from '$lib/config/portal';
import { logger } from '$lib/server/logger';

const emailService = new EmailService();

const money = (dollars: string | number) =>
	`$${Number(dollars).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const shell = (title: string, bodyHtml: string, cta?: { href: string; label: string }) =>
	`
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
  <h2>${title}</h2>
  ${bodyHtml}
  ${
		cta
			? `<p style="margin: 24px 0;"><a href="${cta.href}" style="background-color: #2a93d1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">${cta.label}</a></p>`
			: ''
	}
  <p style="color: #6B7280; font-size: 13px;">${APP_NAME} Affiliate Program</p>
</div>`.trim();

async function send(label: string, to: string, subject: string, html: string, text: string) {
	try {
		const r = await emailService.sendEmail({ to: [{ email: to }], subject, html, text });
		if (r?.success === false) {
			logger.error(`affiliate email failed: ${label}`, { to, error: r.error });
			return false;
		}
		return true;
	} catch (err) {
		logger.error(`affiliate email threw: ${label}`, { to, error: err });
		return false;
	}
}

async function affiliateRecipient(affiliateId: string) {
	const [row] = await db
		.select({
			email: userTable.email,
			firstName: userTable.firstName,
			receiveEmail: userTable.receiveEmail,
			contactEmail: affiliateProfileTable.contactEmail
		})
		.from(affiliateProfileTable)
		.innerJoin(userTable, eq(affiliateProfileTable.userId, userTable.id))
		.where(eq(affiliateProfileTable.id, affiliateId))
		.limit(1);
	if (!row || row.receiveEmail === false) return null;
	return { email: row.contactEmail || row.email, firstName: row.firstName ?? 'there' };
}

async function adminRecipients(): Promise<string[]> {
	const rows = await db
		.select({ email: userTable.email })
		.from(userTable)
		.where(
			and(
				inArray(userTable.role, [USER_ROLES.SUPERADMIN, USER_ROLES.ADMIN]),
				eq(userTable.receiveEmail, true)
			)
		);
	return rows.map((r) => r.email);
}

/* -------------------------------------------------------------------------- */
/* Affiliate-facing                                                           */
/* -------------------------------------------------------------------------- */

/** Sent by the pre-payout cron a few days before the 1st. */
export async function notifyUpcomingPayout(input: {
	affiliateId: string;
	amount: string;
	payoutDate: Date;
	cohortLabel: string;
}): Promise<void> {
	const r = await affiliateRecipient(input.affiliateId);
	if (!r) return;
	const when = format(input.payoutDate, 'MMMM d');
	const subject = `Your ${money(input.amount)} affiliate payout is coming ${when}`;
	const text = `Hi ${r.firstName},\n\nHeads up — your ${input.cohortLabel} affiliate earnings of ${money(input.amount)} are scheduled to be sent to your connected bank account on ${when}.\n\nView the details in your portal: ${PARTNER_PORTAL_URL}/earnings`;
	const html = shell(
		'Your payout is on its way',
		`<p>Hi ${r.firstName},</p><p>Heads up — your <strong>${input.cohortLabel}</strong> affiliate earnings of <strong>${money(input.amount)}</strong> are scheduled to be sent to your connected bank account on <strong>${when}</strong>.</p>`,
		{ href: `${PARTNER_PORTAL_URL}/earnings`, label: 'View earnings' }
	);
	await send('upcomingPayout', r.email, subject, html, text);
}

/** Sent by the payout job on a successful transfer. */
export async function notifyPayoutSent(input: {
	affiliateId: string;
	amount: string;
	cohortLabel: string;
}): Promise<void> {
	const r = await affiliateRecipient(input.affiliateId);
	if (!r) return;
	const subject = `We've sent your ${money(input.amount)} affiliate payout`;
	const text = `Hi ${r.firstName},\n\nYour ${input.cohortLabel} affiliate earnings of ${money(input.amount)} have been sent to your bank account. Depending on your bank it can take a couple of business days to appear.\n\nPayout history: ${PARTNER_PORTAL_URL}/payouts`;
	const html = shell(
		'Payout sent',
		`<p>Hi ${r.firstName},</p><p>Your <strong>${input.cohortLabel}</strong> affiliate earnings of <strong>${money(input.amount)}</strong> have been sent to your bank account. Depending on your bank it can take a couple of business days to appear.</p>`,
		{ href: `${PARTNER_PORTAL_URL}/payouts`, label: 'View payout history' }
	);
	await send('payoutSent', r.email, subject, html, text);
}

/** Sent when someone signs up through the affiliate's link. */
export async function notifyNewReferral(input: {
	affiliateId: string;
	referredRole: string;
}): Promise<void> {
	const r = await affiliateRecipient(input.affiliateId);
	if (!r) return;
	const who = input.referredRole === 'CANDIDATE' ? 'dental professional' : 'dental practice';
	const subject = `A new ${who} just signed up through your link`;
	const text = `Hi ${r.firstName},\n\nA new ${who} just joined ${APP_NAME} using your referral link. You'll earn commission on the temp shifts they generate.\n\nSee your referrals: ${PARTNER_PORTAL_URL}/referrals`;
	const html = shell(
		'New referral',
		`<p>Hi ${r.firstName},</p><p>A new <strong>${who}</strong> just joined ${APP_NAME} using your referral link. You'll earn commission on the temp shifts they generate.</p>`,
		{ href: `${PARTNER_PORTAL_URL}/referrals`, label: 'See your referrals' }
	);
	await send('newReferral', r.email, subject, html, text);
}

/* -------------------------------------------------------------------------- */
/* Admin-facing                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Sent when a payout run has ANY failure. The most common cause — insufficient
 * platform balance — needs a human to top up; nothing automated can fix it.
 * The nightly reconcile retries once funds are there.
 */
export async function notifyAdminsPayoutFailures(input: {
	cohort: string;
	failures: Array<{ affiliateEmail: string; amount: string; reason: string | null }>;
}): Promise<void> {
	const admins = await adminRecipients();
	if (admins.length === 0) {
		logger.warn('payout failure alert: no admin recipients with receiveEmail=true');
		return;
	}
	const total = input.failures.reduce((s, f) => s + Number(f.amount), 0);
	const subject = `⚠️ ${input.failures.length} affiliate payout${input.failures.length === 1 ? '' : 's'} failed (${money(total)})`;
	const rowsText = input.failures
		.map((f) => `  • ${f.affiliateEmail} — ${money(f.amount)} — ${f.reason ?? 'unknown'}`)
		.join('\n');
	const rowsHtml = input.failures
		.map(
			(f) =>
				`<tr><td style="padding:4px 12px 4px 0;">${f.affiliateEmail}</td><td style="padding:4px 12px 4px 0;"><strong>${money(f.amount)}</strong></td><td style="padding:4px 0;color:#B91C1C;">${f.reason ?? 'unknown'}</td></tr>`
		)
		.join('');
	const console_ = `${DOMAIN}/admin/menu/affiliates`;
	const text = `The affiliate payout run for cohort ${input.cohort} had ${input.failures.length} failure(s):\n\n${rowsText}\n\nIf the reason is insufficient funds, top up the Stripe platform balance — the nightly job will retry automatically. Otherwise review at:\n${console_}`;
	const html = shell(
		'Affiliate payout failures',
		`<p>The payout run for cohort <strong>${input.cohort}</strong> had <strong>${input.failures.length}</strong> failure(s):</p><table style="border-collapse:collapse;margin:16px 0;">${rowsHtml}</table><p>If the reason is <em>insufficient funds</em>, top up the Stripe platform balance — the nightly job retries automatically once funds are available. Otherwise review in the admin console.</p>`,
		{ href: console_, label: 'Open affiliate console' }
	);
	await Promise.allSettled(admins.map((a) => send('adminPayoutFailures', a, subject, html, text)));
}
