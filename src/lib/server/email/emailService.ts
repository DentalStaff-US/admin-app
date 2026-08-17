import { env } from '$env/dynamic/private';
import { Resend } from 'resend';
import { chunk } from 'es-toolkit';
import type {
	BulkEmailSendResult,
	EmailConfig,
	EmailRecipient,
	EmailSendResult,
	SendBulkEmailParams,
	SendEmailParams
} from './types';
import { EMAIL_TEMPLATES } from './templates';
import type { Invoice } from '../database/schemas/requisition';

export class EmailService {
	private readonly mailer: Resend;
	private apiKey: string;
	private defaultConfig: EmailConfig;

	constructor() {
		this.apiKey = env.RESEND_API_KEY || '';
		this.mailer = new Resend(this.apiKey);
		this.defaultConfig = {
			from: {
				email: env.COMPANY_FROM_EMAIL,
				name: env.COMPANY_FROM_NAME
			},
			replyTo: {
				email: env.COMPANY_REPLY_TO_EMAIL,
				name: env.COMPANY_REPLY_TO_NAME
			}
		};
	}

	/**
	 * Send a single email
	 */
	async sendEmail(params: SendEmailParams): Promise<EmailSendResult> {
		try {
			const emailData = {
				from: this.formatEmailAddress(this.defaultConfig.from),
				to: params.to.map((recipient) => this.formatEmailAddress(recipient)),
				subject: params.subject,
				html: params.html,
				...(params.text && { text: params.text }),
				...(params.replyTo && {
					replyTo: this.formatEmailAddress(params.replyTo)
				}),
				...(!params.replyTo &&
					this.defaultConfig.replyTo && {
						replyTo: this.formatEmailAddress(this.defaultConfig.replyTo)
					})
			};

			const result = await this.mailer.emails.send(emailData);

			if (result.error) {
				return {
					id: crypto.randomUUID(),
					success: false,
					error: result.error.message
				};
			}

			return {
				id: result.data?.id || '',
				success: true
			};
		} catch (error: any) {
			return {
				id: crypto.randomUUID(),
				success: false,
				error: error.message || 'Unknown error occurred'
			};
		}
	}

	/**
	 * Send multiple emails in bulk using Resend's batch API
	 * Automatically chunks into batches of 100 with 2 second delays
	 */
	async sendBulkEmail(params: SendBulkEmailParams): Promise<BulkEmailSendResult> {
		const results: EmailSendResult[] = [];
		const errors: string[] = [];
		let totalSent = 0;
		let totalFailed = 0;

		const record = (r: EmailSendResult) => {
			results.push(r);
			if (r.success) totalSent++;
			else totalFailed++;
		};

		// Send one email via the single-email API (the same proven path as every
		// transactional email and the "send test" button), retrying once after a
		// short backoff. Resend occasionally rejects the first call transiently
		// (rate-limit/cold connection) then accepts the retry — this makes that
		// self-heal instead of surfacing as a failed recipient that needs a manual
		// "Retry failed".
		const sendOneWithRetry = async (email: SendEmailParams): Promise<EmailSendResult> => {
			const first = await this.sendEmail(email);
			if (first.success) return first;
			await this.delay(800);
			return this.sendEmail(email);
		};

		// Fallback used whenever the batch API errors or returns an incomplete
		// response, so a batch-only quirk never sinks a whole campaign. Sequential +
		// throttled to stay under Resend's 5 req/s limit.
		const sendIndividually = async (batch: SendBulkEmailParams['emails']) => {
			for (const email of batch) {
				record(await sendOneWithRetry(email));
				await this.delay(250);
			}
		};

		// Resend's batch endpoint occasionally rejects a first call transiently (rate
		// blip / cold connection) then accepts the retry — the "fails once, sends on
		// retry" symptom. So we retry the BATCH itself with backoff, keeping batch as
		// the send path. Only if every batch attempt fails do we fall back to
		// individual sends so the campaign still goes out.
		const BATCH_MAX_ATTEMPTS = 3;

		// Chunk emails into batches of 100 (Resend's batch limit)
		const batches = chunk(params.emails, 100);

		for (let i = 0; i < batches.length; i++) {
			const batch = batches[i];

			const batchData = batch.map((email) => ({
				from: this.formatEmailAddress(this.defaultConfig.from),
				to: email.to.map((recipient) => this.formatEmailAddress(recipient)),
				subject: email.subject,
				html: email.html,
				...(email.text && { text: email.text }),
				...(email.replyTo && { replyTo: this.formatEmailAddress(email.replyTo) }),
				...(!email.replyTo &&
					this.defaultConfig.replyTo && {
						replyTo: this.formatEmailAddress(this.defaultConfig.replyTo)
					})
			}));

			let handled = false;
			let lastError = 'unknown error';

			for (let attempt = 1; attempt <= BATCH_MAX_ATTEMPTS && !handled; attempt++) {
				try {
					const batchResult = await this.mailer.batch.send(batchData);

					if (batchResult.error) {
						lastError = batchResult.error.message;
						console.error('Resend batch send failed', {
							batch: i + 1,
							attempt,
							error: lastError
						});
					} else {
						// Success. Resend nests the `{ id }` array under `data.data`
						// (CreateBatchResponse = { data: { data: [{ id }] }, error }).
						const batchResults: Array<{ id?: string }> = batchResult.data?.data ?? [];
						for (let j = 0; j < batch.length; j++) {
							const emailResult = batchResults[j];
							if (emailResult?.id) {
								record({ id: emailResult.id, success: true });
							} else {
								// Rare per-entry gap — cover just that recipient via single send.
								record(await sendOneWithRetry(batch[j]));
								await this.delay(250);
							}
						}
						handled = true;
						break;
					}
				} catch (error) {
					lastError = error instanceof Error ? error.message : String(error);
					console.error('Resend batch threw', { batch: i + 1, attempt, error: lastError });
				}

				// Backoff before the next batch attempt (1s, then 2s).
				if (attempt < BATCH_MAX_ATTEMPTS) await this.delay(1000 * attempt);
			}

			if (!handled) {
				// Every batch attempt failed — deliver via single-sends so the campaign
				// still goes out, and record why batch gave up.
				console.error('Resend batch exhausted retries; sending individually', {
					batch: i + 1,
					attempts: BATCH_MAX_ATTEMPTS,
					error: lastError
				});
				errors.push(
					`Batch ${i + 1} failed after ${BATCH_MAX_ATTEMPTS} attempts (${lastError}) — sent individually`
				);
				await sendIndividually(batch);
			}

			// Wait 2 seconds between batches (except for the last batch)
			if (i < batches.length - 1) {
				await this.delay(2000);
			}
		}

		return { results, totalSent, totalFailed, errors };
	}

	/**
	 * Send the same email to multiple recipients using batch API
	 */
	async sendBroadcast(params: {
		recipients: EmailRecipient[];
		subject: string;
		html: string;
		text?: string;
		batchSize?: number;
	}): Promise<BulkEmailSendResult> {
		// Convert to bulk email format
		const emails = params.recipients.map((recipient) => ({
			to: [recipient],
			subject: params.subject,
			html: params.html,
			...(params.text && { text: params.text })
		}));

		return await this.sendBulkEmail({ emails });
	}

	// ========================================
	// SERVICE CONVENIENCE METHODS
	// ========================================

	/**
	 * Send a welcome email
	 */
	async sendWelcomeEmail(email: string): Promise<EmailSendResult> {
		try {
			const template = EMAIL_TEMPLATES.welcomeEmail();

			const result = await this.sendEmail({
				to: [{ email }],
				subject: template.subject,
				html: template.htmlEmail,
				text: template.textEmail
			});
			return result;
		} catch (error: any) {
			return {
				id: crypto.randomUUID(),
				success: false,
				error: error.message || 'Failed to send welcome email'
			};
		}
	}

	/**
	 * Send a password reset email
	 */
	async sendPasswordResetEmail(email: string, token: string): Promise<EmailSendResult> {
		try {
			const template = EMAIL_TEMPLATES.passwordResetEmail(token);
			const result = await this.sendEmail({
				to: [{ email }],
				subject: template.subject,
				html: template.htmlEmail,
				text: template.textEmail
			});
			return result;
		} catch (error: any) {
			return {
				id: crypto.randomUUID(),
				success: false,
				error: error.message || 'Failed to send password reset email'
			};
		}
	}

	/**
	 * Send verification email
	 */
	async sendVerificationEmail(email: string, token: string): Promise<EmailSendResult> {
		try {
			const template = EMAIL_TEMPLATES.verificationEmail(token);
			const result = await this.sendEmail({
				to: [{ email }],
				subject: template.subject,
				html: template.htmlEmail,
				text: template.textEmail
			});
			return result;
		} catch (error: any) {
			return {
				id: crypto.randomUUID(),
				success: false,
				error: error.message || 'Failed to send verification email'
			};
		}
	}

	/**
	 * Send email address update success email
	 */
	async sendEmailAddressUpdateSuccessEmail(
		email: string,
		token: string | null
	): Promise<EmailSendResult> {
		if (!this.validateEmail(email)) {
			return {
				id: crypto.randomUUID(),
				success: false,
				error: 'Invalid email address'
			};
		}
		if (!token) {
			return {
				id: crypto.randomUUID(),
				success: false,
				error: 'Token is required for email address update success email'
			};
		}
		try {
			const template = EMAIL_TEMPLATES.updateEmailAddressSuccessEmail(token);
			const result = await this.sendEmail({
				to: [{ email }],
				subject: template.subject,
				html: template.htmlEmail,
				text: template.textEmail
			});
			return result;
		} catch (error: any) {
			return {
				id: crypto.randomUUID(),
				success: false,
				error: error.message || 'Failed to send email address update success email'
			};
		}
	}

	/**
	 * Send possible Hijack email
	 */
	async sendPossibleHijackEmail(newEmail: string, oldEmail: string): Promise<EmailSendResult> {
		try {
			const template = EMAIL_TEMPLATES.possibleHijackAttemptEmail(newEmail, oldEmail);
			const result = await this.sendEmail({
				to: [{ email: oldEmail }],
				subject: template.subject,
				html: template.htmlEmail,
				text: template.textEmail
			});
			return result;
		} catch (error: any) {
			return {
				id: crypto.randomUUID(),
				success: false,
				error: error.message || 'Failed to send possible hijack email'
			};
		}
	}

	/**
	 * Send Client Staff user invite email
	 */
	async sendClientStaffInviteEmail(
		email: string,
		token: string,
		companyName: string
	): Promise<EmailSendResult> {
		try {
			const template = EMAIL_TEMPLATES.clientStaffInviteEmail(token, companyName);
			const result = await this.sendEmail({
				to: [{ email }],
				subject: template.subject,
				html: template.htmlEmail,
				text: template.textEmail
			});
			return result;
		} catch (error: any) {
			return {
				id: crypto.randomUUID(),
				success: false,
				error: error.message || 'Failed to send client staff invite email'
			};
		}
	}

	/**
	 * Send Client Staff user invite email
	 */
	async sendAdminUserInviteEmail(email: string, token: string): Promise<EmailSendResult> {
		try {
			const template = EMAIL_TEMPLATES.adminUserInviteEmail(token);
			const result = await this.sendEmail({
				to: [{ email }],
				subject: template.subject,
				html: template.htmlEmail,
				text: template.textEmail
			});
			return result;
		} catch (error: any) {
			return {
				id: crypto.randomUUID(),
				success: false,
				error: error.message || 'Failed to send admin staff invite email'
			};
		}
	}

	/**
	 * Client status transition emails. One method per outgoing message so the
	 * call sites stay tidy and per-template error wrapping is consistent.
	 */
	async sendClientApprovedEmail(
		email: string,
		details: { firstName: string; companyName: string }
	): Promise<EmailSendResult> {
		try {
			const template = EMAIL_TEMPLATES.clientApprovedEmail(details);
			return await this.sendEmail({
				to: [{ email }],
				subject: template.subject,
				html: template.htmlEmail,
				text: template.textEmail
			});
		} catch (error: any) {
			return {
				id: crypto.randomUUID(),
				success: false,
				error: error.message || 'Failed to send client approved email'
			};
		}
	}

	async sendClientDeniedEmail(
		email: string,
		details: { firstName: string; companyName: string }
	): Promise<EmailSendResult> {
		try {
			const template = EMAIL_TEMPLATES.clientDeniedEmail(details);
			return await this.sendEmail({
				to: [{ email }],
				subject: template.subject,
				html: template.htmlEmail,
				text: template.textEmail
			});
		} catch (error: any) {
			return {
				id: crypto.randomUUID(),
				success: false,
				error: error.message || 'Failed to send client denied email'
			};
		}
	}

	async sendClientInactiveEmail(
		email: string,
		details: { firstName: string; companyName: string }
	): Promise<EmailSendResult> {
		try {
			const template = EMAIL_TEMPLATES.clientInactiveEmail(details);
			return await this.sendEmail({
				to: [{ email }],
				subject: template.subject,
				html: template.htmlEmail,
				text: template.textEmail
			});
		} catch (error: any) {
			return {
				id: crypto.randomUUID(),
				success: false,
				error: error.message || 'Failed to send client inactive email'
			};
		}
	}

	/**
	 * Notify an admin that a new support ticket was opened.
	 */
	async sendNewSupportTicketAdminEmail(
		email: string,
		details: {
			ticketId: string;
			title: string;
			body: string | null | undefined;
			reportedByName: string;
			reportedByEmail: string;
			reportedByRole: string;
		}
	): Promise<EmailSendResult> {
		try {
			const template = EMAIL_TEMPLATES.newSupportTicketAdminEmail(details);
			return await this.sendEmail({
				to: [{ email }],
				subject: template.subject,
				html: template.htmlEmail,
				text: template.textEmail
			});
		} catch (error: any) {
			return {
				id: crypto.randomUUID(),
				success: false,
				error: error.message || 'Failed to send new support ticket admin email'
			};
		}
	}

	/**
	 * Notify an admin that a new client signed up.
	 */
	async sendNewClientSignupAdminEmail(
		email: string,
		details: {
			clientId: string;
			companyName: string;
			contactName: string;
			contactEmail: string;
			contactPhone: string | null | undefined;
			signedUpAt: Date;
		}
	): Promise<EmailSendResult> {
		try {
			const template = EMAIL_TEMPLATES.newClientSignupAdminEmail(details);
			const result = await this.sendEmail({
				to: [{ email }],
				subject: template.subject,
				html: template.htmlEmail,
				text: template.textEmail
			});
			return result;
		} catch (error: any) {
			return {
				id: crypto.randomUUID(),
				success: false,
				error: error.message || 'Failed to send new client signup admin email'
			};
		}
	}

	/**
	 * Notify an admin that a professional profile was created.
	 */
	async sendNewCandidateSignupAdminEmail(
		email: string,
		details: {
			candidateId: string;
			candidateName: string;
			candidateEmail: string;
			candidatePhone: string | null | undefined;
			location: string | null;
			createdAt: Date;
		}
	): Promise<EmailSendResult> {
		try {
			const template = EMAIL_TEMPLATES.newCandidateSignupAdminEmail(details);
			const result = await this.sendEmail({
				to: [{ email }],
				subject: template.subject,
				html: template.htmlEmail,
				text: template.textEmail
			});
			return result;
		} catch (error: any) {
			return {
				id: crypto.randomUUID(),
				success: false,
				error: error.message || 'Failed to send candidate onboarded admin email'
			};
		}
	}

	/**
	 * Notify an admin that a professional is ready for approval.
	 */
	async sendCandidateReadyForApprovalAdminEmail(
		email: string,
		details: {
			candidateId: string;
			candidateName: string;
			candidateEmail: string;
			location: string | null;
			disciplines: string[];
			status: string;
		}
	): Promise<EmailSendResult> {
		try {
			const template = EMAIL_TEMPLATES.candidateReadyForApprovalAdminEmail(details);
			const result = await this.sendEmail({
				to: [{ email }],
				subject: template.subject,
				html: template.htmlEmail,
				text: template.textEmail
			});
			return result;
		} catch (error: any) {
			return {
				id: crypto.randomUUID(),
				success: false,
				error: error.message || 'Failed to send ready-for-approval admin email'
			};
		}
	}

	/**
	 * Send Workday Reminder email
	 */

	async sendWorkdayReminderEmail(
		email: string,
		workdayDetails: {
			companyName: string;
			location: string;
			date: string;
			workdayStart: string;
			workdayEnd: string;
		}
	): Promise<EmailSendResult> {
		try {
			const template = EMAIL_TEMPLATES.workdayReminderEmail(workdayDetails);
			const result = await this.sendEmail({
				to: [{ email }],
				subject: template.subject,
				html: template.htmlEmail,
				text: template.textEmail
			});
			return result;
		} catch (error: any) {
			return {
				id: crypto.randomUUID(),
				success: false,
				error: error.message || 'Failed to send workday reminder email'
			};
		}
	}

	/**
	 * Send Workday Claimed email
	 */
	async sendRecurrenceDayClaimedEmail(
		email: string,
		workdayDetails: {
			url: string;
			companyName: string;
			location: string;
			date: string;
			workdayStart: string;
			workdayEnd: string;
			discipline: string;
		},
		candidateDetails: {
			firstName: string;
			lastName: string;
		}
	): Promise<EmailSendResult> {
		try {
			console.log('Sending recurrence day claimed email to:', email);
			const template = EMAIL_TEMPLATES.recurrenceDayFilledEmail(workdayDetails, candidateDetails);
			const result = await this.sendEmail({
				to: [{ email }],
				subject: template.subject,
				html: template.htmlEmail,
				text: template.textEmail
			});
			return result;
		} catch (error: any) {
			return {
				id: crypto.randomUUID(),
				success: false,
				error: error.message || 'Failed to send recurrence day claimed email'
			};
		}
	}

	/**
	 * Send Workday Cancelled email
	 */

	async sendWorkdayCancelledEmail(
		email: string,
		recurrenceDayDetails: any
	): Promise<EmailSendResult> {
		try {
			const template = EMAIL_TEMPLATES.recurrenceDayClosedEmail(recurrenceDayDetails);
			const result = await this.sendEmail({
				to: [{ email }],
				subject: template.subject,
				html: template.htmlEmail,
				text: template.textEmail
			});
			return result;
		} catch (error: any) {
			return {
				id: crypto.randomUUID(),
				success: false,
				error: error.message || 'Failed to send recurrence day closed email'
			};
		}
	}

	/**
	 * Send Overdue Invoice Reminder email
	 */
	async sendOverdueInvoiceReminderEmail(
		email: string,
		invoiceDetails: Invoice
	): Promise<EmailSendResult> {
		try {
			const template = EMAIL_TEMPLATES.overdueInvoiceReminderEmail(invoiceDetails);
			const result = await this.sendEmail({
				to: [{ email }],
				subject: template.subject,
				html: template.htmlEmail,
				text: template.textEmail
			});
			return result;
		} catch (error: any) {
			return {
				id: crypto.randomUUID(),
				success: false,
				error: error.message || 'Failed to send overdue invoice reminder email'
			};
		}
	}
	// ========================================
	// PRIVATE HELPER METHODS
	// ========================================

	/**
	 * Validate email addresses
	 */
	private validateEmail(email: string): boolean {
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		return emailRegex.test(email);
	}

	/**
	 * Validate multiple email addresses
	 */
	private validateEmails(emails: string[]): { valid: string[]; invalid: string[] } {
		const valid: string[] = [];
		const invalid: string[] = [];

		for (const email of emails) {
			if (this.validateEmail(email)) {
				valid.push(email);
			} else {
				invalid.push(email);
			}
		}

		return { valid, invalid };
	}

	private formatEmailAddress(contact: { email: string; name?: string }): string {
		return contact.name ? `${contact.name} <${contact.email}>` : contact.email;
	}

	private normalizeRecipients(to: string | EmailRecipient | EmailRecipient[]): EmailRecipient[] {
		if (typeof to === 'string') {
			return [{ email: to }];
		}

		if (Array.isArray(to)) {
			return to;
		}

		return [to];
	}

	private stripHtml(html: string): string {
		return html
			.replace(/<[^>]*>/g, '')
			.replace(/&nbsp;/g, ' ')
			.replace(/&amp;/g, '&')
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/\s+/g, ' ')
			.trim();
	}

	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}
