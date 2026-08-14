import { APP_NAME, USER_ROLES } from '$lib/config/constants';
import { BASE_URL } from '$env/static/private';
import { env } from '$env/dynamic/private';
import type { Invoice } from '../database/schemas/requisition';
import { format } from 'date-fns';

// Builds the "For any questions … please contact us …" sentence, including each
// channel only when it's actually configured — so we never render "call us at
// undefined" when COMPANY_PHONE_NUMBER (or the reply-to email) isn't set.
function contactClause(topic: string): { text: string; html: string } {
	const email = env.COMPANY_REPLY_TO_EMAIL;
	const phone = env.COMPANY_PHONE_NUMBER;
	const textParts: string[] = [];
	const htmlParts: string[] = [];
	if (email) {
		textParts.push(`contact us at ${email}`);
		htmlParts.push(`contact us at <a href="mailto:${email}">${email}</a>`);
	}
	if (phone) {
		textParts.push(`call us at ${phone}`);
		htmlParts.push(`call us at ${phone}`);
	}
	if (textParts.length === 0) return { text: '', html: '' };
	return {
		text: `For any questions about ${topic}, please ${textParts.join(' or ')}.`,
		html: `<p>For any questions about ${topic}, please ${htmlParts.join(' or ')}.</p>`
	};
}

export const EMAIL_TEMPLATES: Record<
	string,
	(...args: any[]) => { textEmail: string; htmlEmail: string; subject: string }
> = {
	// Sent when an admin (or the client) requests a billing/payment setup link.
	// Lets the customer finish adding their payment method even if they were
	// interrupted and never returned.
	billingSetupLinkEmail: (details: { clientName: string; setupLink: string }) => {
		return {
			textEmail: `
            Hello ${details.clientName},

            To finish setting up billing for your account, please add your payment method using the secure link below:

            ${details.setupLink}

            This lets you securely enter your payment details so we can process invoices for completed work. If you've already completed setup, you can safely ignore this email.

            For any questions, contact us at ${env.COMPANY_REPLY_TO_EMAIL} or call us at ${env.COMPANY_PHONE_NUMBER}.

            Thank you,

            Dental Temps Staffing Solutions`,
			htmlEmail: `
            <p>Hello ${details.clientName},</p>

            <p>To finish setting up billing for your account, please add your payment method using the secure link below:</p>

            <p>
              <a href="${details.setupLink}" style="display:inline-block;padding:12px 20px;background:#1e40af;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">Complete Payment Setup</a>
            </p>

            <p>Or copy and paste this link into your browser:<br />
            <a href="${details.setupLink}">${details.setupLink}</a></p>

            <p>This lets you securely enter your payment details so we can process invoices for completed work. If you've already completed setup, you can safely ignore this email.</p>

            <p>For any questions, contact us at <a href="mailto:${env.COMPANY_REPLY_TO_EMAIL}">${env.COMPANY_REPLY_TO_EMAIL}</a> or call us at ${env.COMPANY_PHONE_NUMBER}.</p>

            <p>Thank you,</p>
            <p>Dental Temps Staffing Solutions</p>
            `.trim(),
			subject: `Complete Your Payment Setup | ${APP_NAME}`
		};
	},
	welcomeEmail: () => {
		const textEmail = `
            Thanks for verifying your account with ${APP_NAME}.
            You can now sign in to your account at the link below:
            ${BASE_URL}/auth/sign-in
        `.trim();

		const htmlEmail = `
            <p>Thanks for verifying your account with ${APP_NAME}.</p>
            <p>You can now <a href="${BASE_URL}/auth/sign-in">sign in</a> to your account.</p>
        `.trim();

		const subject = `Welcome to ${APP_NAME}`;

		return { textEmail, htmlEmail, subject };
	},
	verificationEmail: (token: string) => {
		const verifyEmailURL = `${BASE_URL}/auth/verify/email-${token}`;
		const textEmail = `Please visit the link below to verify your email address for your ${APP_NAME} account.\n\n
            ${verifyEmailURL} \n\nIf you did not create this account, you can disregard this email.`;
		const htmlEmail = `<p>Please click this <a href="${verifyEmailURL}">link</a> to verify your email address for your ${APP_NAME} account.</p>  <p>You can also visit the link below.</p><p>${verifyEmailURL}</p><p>If you did not create this account, you can disregard this email.</p>`;
		const subject = `Please confirm your email address for ${APP_NAME}`;

		return { textEmail, htmlEmail, subject };
	},
	passwordResetEmail: (token: string) => {
		const updatePasswordURL = `${BASE_URL}/auth/password/update-${token}`;

		const textEmail = `
            Please visit the link below to change your password for ${APP_NAME}:
            ${updatePasswordURL}

            If you did not request to change your password, you can disregard this email.
        `.trim();

		const htmlEmail = `
            <p>Please click this <a href="${updatePasswordURL}">link</a> to change your password for ${APP_NAME}.</p>
            <p>You can also visit the link below:</p>
            <p>${updatePasswordURL}</p>
            <p>If you did not request to change your password, you can disregard this email.</p>
        `.trim();

		const subject = `Change your password for ${APP_NAME}`;

		return { textEmail, htmlEmail, subject };
	},
	updateEmailAddressSuccessEmail: (token: string) => {
		const verifyEmailURL = `${BASE_URL}/auth/verify/email-${token}`;

		const textEmail = `
            Please visit the link below to verify your email address for your ${APP_NAME} account:
            ${verifyEmailURL}
        `.trim();

		const htmlEmail = `
            <p>Please click this <a href="${verifyEmailURL}">link</a> to verify your email address for your ${APP_NAME} account.</p>
            <p>You can also visit the link below:</p>
            <p>${verifyEmailURL}</p>
        `.trim();

		const subject = `Please confirm your email address for ${APP_NAME}`;

		return { textEmail, htmlEmail, subject };
	},
	possibleHijackAttemptEmail: (email: string, oldEmail: string) => {
		const textEmail = `
            Your ${APP_NAME} account email has been updated from ${oldEmail} to ${email}.
            If you DID NOT request this change, please contact support at: ${env.COMPANY_REPLY_TO_EMAIL} to revert the changes.
        `.trim();

		const htmlEmail = `
            <p>Your ${APP_NAME} account email has been updated from ${oldEmail} to ${email}.</p>
            <p>If you DID NOT request this change, please contact support at: ${env.COMPANY_REPLY_TO_EMAIL} to revert the changes.</p>
        `.trim();

		const subject = `Your email address for ${APP_NAME} has changed.`;

		return { textEmail, htmlEmail, subject };
	},
	clientStaffInviteEmail: (token: string, companyName: string) => {
		const verifyEmailURL = `${BASE_URL}/auth/invite/${token}`;

		const textEmail = `
            You have been invited by your employer to join ${companyName}'s workspace in ${APP_NAME}.

            Click the link below to accept the invitation and set up your account:
            ${verifyEmailURL}

            This invitation will expire in 7 days.

            If you weren't expecting this invitation, you can safely ignore this email.

            Best regards,
            The ${APP_NAME} Team
        `.trim();

		const htmlEmail = `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2>Welcome to ${APP_NAME}</h2>
                    <p>You have been invited by your employer to join ${companyName}'s workspace in ${APP_NAME}.</p>

                    <p style="margin: 24px 0;">
                            <a href="${verifyEmailURL}"
                                 style="background-color: #4F46E5; color: white; padding: 12px 24px;
                                                text-decoration: none; border-radius: 4px; display: inline-block;">
                                    Accept Invitation
                            </a>
                    </p>

                    <p>Or copy and paste this link into your browser:</p>
                    <p style="background-color: #F3F4F6; padding: 12px; border-radius: 4px; word-break: break-all;">
                            ${verifyEmailURL}
                    </p>

                    <p style="color: #6B7280; font-size: 14px;">This invitation will expire in 7 days.</p>

                    <p style="color: #6B7280; font-size: 14px; margin-top: 24px;">
                            If you weren't expecting this invitation, you can safely ignore this email.
                    </p>
            </div>
        `.trim();

		const subject = `You're invited to join ${companyName} on ${APP_NAME}`;

		return { textEmail, htmlEmail, subject };
	},
	clientApprovedEmail: (details: { firstName: string; companyName: string }) => {
		const dashboardUrl = `${BASE_URL}/dashboard`;
		const greeting = details.firstName ? `Hi ${details.firstName},` : 'Hi,';
		const company = details.companyName || 'your account';

		const textEmail = `
            ${greeting}

            Good news — ${company} has been approved on ${APP_NAME}. You can now
            sign in and start posting requisitions for your locations.

            ${dashboardUrl}

            Welcome aboard,
            The ${APP_NAME} Team
        `.trim();

		const htmlEmail = `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <h2>You're approved</h2>
                <p>${greeting}</p>
                <p>Good news — <strong>${company}</strong> has been approved on ${APP_NAME}. You can now sign in and start posting requisitions for your locations.</p>
                <p style="margin: 24px 0;">
                    <a href="${dashboardUrl}"
                        style="background-color: #2a93d1; color: white; padding: 12px 24px;
                        text-decoration: none; border-radius: 4px; display: inline-block;">
                        Go to your dashboard
                    </a>
                </p>
                <p style="color: #6B7280; font-size: 14px;">Welcome aboard,<br/>The ${APP_NAME} Team</p>
            </div>
        `.trim();

		const subject = `${company} is approved on ${APP_NAME}`;

		return { textEmail, htmlEmail, subject };
	},
	clientDeniedEmail: (details: { firstName: string; companyName: string }) => {
		const greeting = details.firstName ? `Hi ${details.firstName},` : 'Hi,';
		const company = details.companyName || 'your account';
		const contactEmail = env.COMPANY_REPLY_TO_EMAIL || '';

		const textEmail = `
            ${greeting}

            We weren't able to approve ${company} on ${APP_NAME} at this time.
            If you believe this was a mistake or want to discuss next steps,
            please reach out to us${contactEmail ? ` at ${contactEmail}` : ''}.

            The ${APP_NAME} Team
        `.trim();

		const htmlEmail = `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <h2>About your ${APP_NAME} account</h2>
                <p>${greeting}</p>
                <p>We weren't able to approve <strong>${company}</strong> on ${APP_NAME} at this time.</p>
                <p>If you believe this was a mistake or want to discuss next steps, please reach out${contactEmail ? ` at <a href="mailto:${contactEmail}">${contactEmail}</a>` : ''}.</p>
                <p style="color: #6B7280; font-size: 14px;">The ${APP_NAME} Team</p>
            </div>
        `.trim();

		const subject = `Update on your ${APP_NAME} application`;

		return { textEmail, htmlEmail, subject };
	},
	clientInactiveEmail: (details: { firstName: string; companyName: string }) => {
		const greeting = details.firstName ? `Hi ${details.firstName},` : 'Hi,';
		const company = details.companyName || 'your account';
		const contactEmail = env.COMPANY_REPLY_TO_EMAIL || '';

		const textEmail = `
            ${greeting}

            ${company} has been marked inactive on ${APP_NAME}. While inactive,
            you and your staff will not be able to create new requisitions.

            If this is unexpected${contactEmail ? `, please reach out to us at ${contactEmail}` : ', please get in touch'}.

            The ${APP_NAME} Team
        `.trim();

		const htmlEmail = `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <h2>Your ${APP_NAME} account is now inactive</h2>
                <p>${greeting}</p>
                <p><strong>${company}</strong> has been marked inactive on ${APP_NAME}. While inactive, you and your staff will not be able to create new requisitions.</p>
                <p>If this is unexpected${contactEmail ? `, please reach out at <a href="mailto:${contactEmail}">${contactEmail}</a>` : ', please get in touch'}.</p>
                <p style="color: #6B7280; font-size: 14px;">The ${APP_NAME} Team</p>
            </div>
        `.trim();

		const subject = `${company} has been marked inactive on ${APP_NAME}`;

		return { textEmail, htmlEmail, subject };
	},
	newClientSignupAdminEmail: (details: {
		clientId: string;
		companyName: string;
		contactName: string;
		contactEmail: string;
		contactPhone: string | null | undefined;
		signedUpAt: Date;
	}) => {
		const { clientId, companyName, contactName, contactEmail, contactPhone, signedUpAt } = details;
		const profileUrl = `${BASE_URL}/clients/${clientId}`;
		const signedUpAtFormatted = format(signedUpAt, 'PPPp');
		const phoneLine = contactPhone ? `Phone: ${contactPhone}` : 'Phone: (not provided)';

		const textEmail = `
            A new client just signed up on ${APP_NAME} and is awaiting review.

            Business: ${companyName}
            Primary contact: ${contactName} <${contactEmail}>
            ${phoneLine}
            Signed up: ${signedUpAtFormatted}

            Review their profile:
            ${profileUrl}
        `.trim();

		const htmlEmail = `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <h2>New client signup</h2>
                <p>A new client just signed up on ${APP_NAME} and is awaiting review.</p>
                <table style="border-collapse: collapse; margin: 16px 0;">
                    <tr><td style="padding: 4px 12px 4px 0; color: #6B7280;">Business</td><td style="padding: 4px 0;"><strong>${companyName}</strong></td></tr>
                    <tr><td style="padding: 4px 12px 4px 0; color: #6B7280;">Contact</td><td style="padding: 4px 0;">${contactName} &lt;<a href="mailto:${contactEmail}">${contactEmail}</a>&gt;</td></tr>
                    <tr><td style="padding: 4px 12px 4px 0; color: #6B7280;">Phone</td><td style="padding: 4px 0;">${contactPhone ?? '(not provided)'}</td></tr>
                    <tr><td style="padding: 4px 12px 4px 0; color: #6B7280;">Signed up</td><td style="padding: 4px 0;">${signedUpAtFormatted}</td></tr>
                </table>
                <p style="margin: 24px 0;">
                    <a href="${profileUrl}"
                        style="background-color: #2a93d1; color: white; padding: 12px 24px;
                        text-decoration: none; border-radius: 4px; display: inline-block;">
                        View Client Profile
                    </a>
                </p>
                <p style="color: #6B7280; font-size: 14px;">Or open it directly: ${profileUrl}</p>
            </div>
        `.trim();

		const subject = `Pending review: new client signup — ${companyName}`;

		return { textEmail, htmlEmail, subject };
	},
	newSupportTicketAdminEmail: (details: {
		ticketId: string;
		title: string;
		body: string | null | undefined;
		reportedByName: string;
		reportedByEmail: string;
		reportedByRole: string;
	}) => {
		const { ticketId, title, body, reportedByName, reportedByEmail, reportedByRole } = details;
		const url = `${BASE_URL}/support/ticket/${ticketId}`;
		const bodyExcerpt = body && body.trim().length > 0 ? body : '(no additional notes provided)';

		const textEmail = `
            New support ticket on ${APP_NAME}.

            Title: ${title}
            From: ${reportedByName} <${reportedByEmail}> (${reportedByRole})

            ${bodyExcerpt}

            Open the ticket:
            ${url}
        `.trim();

		const htmlEmail = `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <h2>New support ticket</h2>
                <table style="border-collapse: collapse; margin: 16px 0;">
                    <tr><td style="padding: 4px 12px 4px 0; color: #6B7280;">Title</td><td style="padding: 4px 0;"><strong>${title}</strong></td></tr>
                    <tr><td style="padding: 4px 12px 4px 0; color: #6B7280;">From</td><td style="padding: 4px 0;">${reportedByName} &lt;<a href="mailto:${reportedByEmail}">${reportedByEmail}</a>&gt; (${reportedByRole})</td></tr>
                </table>
                <div style="background-color: #F9FAFB; border-left: 3px solid #D1D5DB; padding: 12px 16px; margin: 16px 0; white-space: pre-wrap;">${bodyExcerpt}</div>
                <p style="margin: 24px 0;">
                    <a href="${url}"
                        style="background-color: #2a93d1; color: white; padding: 12px 24px;
                        text-decoration: none; border-radius: 4px; display: inline-block;">
                        Open Ticket
                    </a>
                </p>
                <p style="color: #6B7280; font-size: 14px;">Or open it directly: ${url}</p>
            </div>
        `.trim();

		const subject = `[${APP_NAME}] New support ticket: ${title}`;

		return { textEmail, htmlEmail, subject };
	},
	adminUserInviteEmail: (token: string) => {
		const verifyEmailURL = `${BASE_URL}/auth/invite/${token}`;
		const textEmail = `
            You have been invited to join ${APP_NAME} as an admin user.
            Click the link below to accept the invitation and set up your account:
            ${verifyEmailURL}

            This invitation will expire in 7 days.

            If you weren't expecting this invitation, you can safely ignore this email.
        `.trim();
		const htmlEmail = `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <h2>Welcome to ${APP_NAME}</h2>
                <p>You have been invited to join ${APP_NAME} as an admin user.</p>
                <p style="margin: 24px 0;">
                    <a href="${verifyEmailURL}"
                        style="background-color: #4F46E5; color: white; padding: 12px 24px;
                        text-decoration: none; border-radius: 4px; display: inline-block;">
                        Accept Invitation
                    </a>
                </p>
                <p>Or copy and paste this link into your browser:</p>
                <p style="background-color: #F3F4F6; padding: 12px; border-radius: 4px; word-break: break-all;">
                    ${verifyEmailURL}
                </p>
                <p style="color: #6B7280; font-size: 14px;">This invitation will expire in 7 days.</p>
                <p style="color: #6B7280; font-size: 14px; margin-top: 24px;">
                    If you weren't expecting this invitation, you can safely ignore this email.
                </p>
            </div>
        `.trim();
		const subject = `You're invited to join ${APP_NAME} as an admin user`;
		return { textEmail, htmlEmail, subject };
	},
	workdayReminderEmail: (workdayDetails: {
		companyName: string;
		location: string;
		date: string;
		workdayStart: string;
		workdayEnd: string;
	}) => {
		const { companyName, location, date, workdayStart, workdayEnd } = workdayDetails;
		const textEmail = `
            Reminder: Your shift at ${companyName} is scheduled for ${date}.
            Location: ${location}
            Shift Start: ${workdayStart}
            Shift End: ${workdayEnd}
        `.trim();

		const htmlEmail = `
            <p>Reminder: Your shift at <strong>${companyName}</strong> is scheduled for <strong>${date}</strong>.</p>
            <p>Location: <strong>${location}</strong></p>
            <p>Shift Start: <strong>${workdayStart}</strong></p>
            <p>Shift End: <strong>${workdayEnd}</strong></p>
        `.trim();

		const subject = `Workday Reminder for ${companyName} on ${date} | ${APP_NAME}`;

		return { textEmail, htmlEmail, subject };
	},
	overdueInvoiceReminderEmail: (invoiceDetails: Invoice) => {
		const textEmail = `
            This is a reminder that your invoice is due on ${format(invoiceDetails.dueDate!, 'PPp')}.
            Please visit the link below to view and pay your invoice:
            ${invoiceDetails.stripeHostedUrl}

            If you have any questions, please contact us.
        `.trim();
		const htmlEmail = `
            <p>This is a reminder that your invoice is due on <strong>${format(invoiceDetails.dueDate!, 'PPp')}</strong>.</p>
            <p>Please visit the link below to view and pay your invoice:</p>
            <p><a href="${invoiceDetails.stripeHostedUrl}">${invoiceDetails.stripeHostedUrl}</a></p>
            <p>If you have any questions, please contact us.</p>
        `.trim();
		const subject = `Invoice Reminder - Due on ${format(invoiceDetails.dueDate!, 'PPp')} | ${APP_NAME}`;
		return { textEmail, htmlEmail, subject };
	},
	invoicePaymentSuccessEmail: (invoiceLink: string, paymentDate: string) => {
		const textEmail = `
            Thank you for your payment! Your invoice has been successfully paid on ${paymentDate}.
            You can view your invoice at the link below:
            ${invoiceLink}

            If you have any questions, please contact us.
        `.trim();
		const htmlEmail = `
            <p>Thank you for your payment! Your invoice has been successfully paid on <strong>${paymentDate}</strong>.</p>
            <p>You can view your invoice at the link below:</p>
            <p><a href="${invoiceLink}">${invoiceLink}</a></p>
            <p>If you have any questions, please contact us.</p>
        `.trim();
		const subject = `Payment Confirmation - Invoice Paid on ${paymentDate} | ${APP_NAME}`;
		return { textEmail, htmlEmail, subject };
	},
	recurrenceDayFilledEmail: (
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
	) => {
		const { url, location, date, workdayStart, workdayEnd } = workdayDetails;
		const { firstName, lastName } = candidateDetails;
		const textEmail = `
            Your workday shift on ${date} has been filled by: ${firstName} ${lastName} for the following position:\n
            ${workdayDetails.discipline}\n
            Location: ${location}\n
            Shift Start: ${workdayStart}\n
            Shift End: ${workdayEnd}\n
            You can view the details of your workday at the link below:\n
            ${url}\n
            If you have any questions, please contact us.
        `.trim();
		const htmlEmail = `
            <p>Your workday shift on ${date} has been filled by: <strong>${firstName} ${lastName}</strong> for the following position:</p>
            <p><strong>${workdayDetails.discipline}</strong></p>
            <p>Location: <strong>${location}</strong></p>
            <p>Shift Start: <strong>${workdayStart}</strong></p>
            <p>Shift End: <strong>${workdayEnd}</strong></p>
            <p>You can view the details of your workday at the link below:</p>
            <p><a href="${url}">${url}</a></p>
            <p>If you have any questions, please contact us.</p>
        `.trim();
		const subject = `Workday Shift Filled | ${date} | ${APP_NAME}`;
		return { textEmail, htmlEmail, subject };
	},
	workdayCancelledEmail: (workdayDetails: {
		companyName: string;
		location: string;
		date: string;
		workdayStart: string;
		workdayEnd: string;
	}) => {
		return {
			textEmail: `
            Your workday at ${workdayDetails.companyName} scheduled for ${workdayDetails.date} has been cancelled.\n
            Location: ${workdayDetails.location}\n
            Shift Start: ${workdayDetails.workdayStart}\n
            Shift End: ${workdayDetails.workdayEnd}\n
            If you have any questions, please contact us.
        `.trim(),
			htmlEmail: `
            <p>Your workday at <strong>${workdayDetails.companyName}</strong> scheduled for <strong>${workdayDetails.date}</strong> has been cancelled.</p>
            <p>Location: <strong>${workdayDetails.location}</strong></p>
            <p>Shift Start: <strong>${workdayDetails.workdayStart}</strong></p>
            <p>Shift End: <strong>${workdayDetails.workdayEnd}</strong></p>
            <p>If you have any questions, please contact us.</p>
        `.trim(),
			subject: `Workday Shift Cancelled | ${APP_NAME}`
		};
	},
	workdayRepostedNotificationEmail: (workdayDetails: {
		clientName: string;
		companyName: string;
		location: string;
		date: string;
		workdayStart: string;
		workdayEnd: string;
		candidateName: string;
		discipline: string;
		url: string;
	}) => {
		return {
			textEmail: `
            Dear ${workdayDetails.clientName},

            Unfortunately ${workdayDetails.candidateName} had to repost (${workdayDetails.date}) on ${workdayDetails.discipline}. We are working on re-filling this day.

            Thanks,
            DTSS Management.`.trim(),
			htmlEmail: `
            <p>Dear ${workdayDetails.clientName},</p>

            <p>Unfortunately ${workdayDetails.candidateName} had to repost (${workdayDetails.date}) on ${workdayDetails.discipline}. We are working on re-filling this day.</p>

            <p>
                Thanks,<br>
                DTSS Management.
            </p>
        `.trim(),
			subject: `Workday Shift Reposted | ${APP_NAME}`
		};
	},
	newSupportTicketEmail: (ticketDetails: { reportedBy: string; createdAt: string; id: string }) => {
		return { textEmail: '', htmlEmail: '', subject: '' };
	},
	supportTicketCommentAddedEmail: (ticketDetails: {
		id: string;
		title: string;
		createdAt: string;
	}) => {
		return { textEmail: '', htmlEmail: '', subject: '' };
	},
	adminUserRequestNotificationEmail: (userDetails: {
		firstName: string;
		lastName: string;
		email: string;
		role: keyof typeof USER_ROLES;
	}) => {
		return {
			textEmail: `
            Dear Admin,
            
            ${userDetails.firstName} ${userDetails.lastName} has requested a ${userDetails.role
							.split('_')
							.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
							.join(
								' '
							)} account. Log in to Accept or Reject their request by marking them Active or Inactive.
            `,
			htmlEmail: `
            <p>Dear Admin,</p>
            <p>${userDetails.firstName} ${userDetails.lastName} has requested a ${userDetails.role
							.split('_')
							.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
							.join(
								' '
							)} account. Log in to Accept or Reject their request by marking them Active or Inactive.</p>
        `.trim(),
			subject: `New User Request | ${APP_NAME}`
		};
	},
	userRequestApprovedNotificationEmail: (userDetails: {
		firstName: string;
		lastName: string;
		email: string;
		role: keyof typeof USER_ROLES;
	}) => {
		return {
			textEmail: `
            Hello ${userDetails.firstName} ${userDetails.lastName},

            Your request for a ${userDetails.role
							.split('_')
							.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
							.join(
								' '
							)} account has been approved. You can now log in and start using your account.
            `,
			htmlEmail: `
            <p>Hello ${userDetails.firstName} ${userDetails.lastName},</p>
            <p>Your request for a ${userDetails.role
							.split('_')
							.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
							.join(
								' '
							)} account has been approved. You can now log in and start using your account.</p>
        `.trim(),
			subject: `User Request Approved | ${APP_NAME}`
		};
	},
	// `location` is the practice's general area (city, state) — never its name or
	// street address. Candidate-facing notifications are outside the app's
	// masking, so a full address here would hand over exactly what
	// $lib/server/privacy/clientIdentity withholds until a shift is claimed.
	qualifiedCandidateNotificationEmail: (
		candidateDetails: { firstName: string; lastName: string },
		workdayDetails: {
			discipline: string;
			location: string;
			experience: string;
			days: Array<{ date: string; workdayStart: string; workdayEnd: string }>;
		}
	) => {
		const daysText = workdayDetails.days.length
			? workdayDetails.days
					.map((d) => `              - ${d.date}: ${d.workdayStart} - ${d.workdayEnd}`)
					.join('\n')
			: '              (See requisition for details)';
		const daysHtml = workdayDetails.days.length
			? workdayDetails.days
					.map((d) => `<li><strong>${d.date}:</strong> ${d.workdayStart} - ${d.workdayEnd}</li>`)
					.join('')
			: '<li>(See requisition for details)</li>';

		return {
			textEmail: `
            Hello ${candidateDetails.firstName} ${candidateDetails.lastName},

            A new job has been created that matches your: ${workdayDetails.discipline} credentials and availability.

            More info on the Requisition:
            Desired Experience: ${workdayDetails.experience}
            Area: ${workdayDetails.location}

            Assignment Dates and Times:
${daysText}

            Log in to your personal account or call us at (888) 653-1657 to accept this position.
            `,
			htmlEmail: `
            <p>Hello ${candidateDetails.firstName} ${candidateDetails.lastName},</p>

            <p>A new job has been created that matches your: <strong>${workdayDetails.discipline}</strong> credentials and availability.</p>

            <p>More info on the Requisition:</p>
            <ul>
                <li><strong>Desired Experience:</strong> ${workdayDetails.experience}</li>
                <li><strong>Area:</strong> ${workdayDetails.location}</li>
            </ul>

            <p><strong>Assignment Dates and Times:</strong></p>
            <ul>${daysHtml}</ul>

            <p>Log in to your personal account or call us at (888) 653-1657 to accept this position.</p>
            `.trim(),
			subject: `New Requisition Available | ${APP_NAME}`
		};
	},
	candidateAssignedNotificationEmail: (
		candidateDetails: { firstName: string | null },
		details: {
			daysLanguage: string;
			disciplineName: string;
			requisitionNumber: number;
			loginUrl: string;
		}
	) => {
		const name = candidateDetails.firstName ?? 'there';
		return {
			subject: `You've been assigned a shift | ${APP_NAME}`,
			textEmail: `
            Hello ${name},

            You have been assigned by DTSS to requisition #${details.requisitionNumber}: ${details.disciplineName} for ${details.daysLanguage}.

            Please log in to DTSS to verify your shift start times: ${details.loginUrl}

            Thanks for working with ${APP_NAME}.
            `,
			htmlEmail: `
            <p>Hello ${name},</p>
            <p>You have been assigned by DTSS to requsition <strong>#${details.requisitionNumber}: ${details.disciplineName}</strong> for <strong>${details.daysLanguage}</strong>.</p>
            <p>Please log in to DTSS to verify your shift start times: <a href="${details.loginUrl}">${details.loginUrl}</a></p>
            <p>Thanks for working with ${APP_NAME}.</p>
            `.trim()
		};
	},
	applicationApprovedNotificationEmail: (
		candidateDetails: { firstName: string | null },
		details: { discipline: string; company: string; dashboardUrl: string }
	) => {
		const name = candidateDetails.firstName ?? 'there';
		return {
			subject: `Your application was approved | ${APP_NAME}`,
			textEmail: `
            Hello ${name},

            Good news — your application for the ${details.discipline} position at ${details.company} was approved.

            The business will be in touch with next steps. You can also check your candidate dashboard for updates: ${details.dashboardUrl}

            Thanks for using ${APP_NAME}.
            `,
			htmlEmail: `
            <p>Hello ${name},</p>
            <p>Good news — your application for the <strong>${details.discipline}</strong> position at <strong>${details.company}</strong> was approved.</p>
            <p>The business will be in touch with next steps. You can also check your candidate dashboard for updates: <a href="${details.dashboardUrl}">${details.dashboardUrl}</a></p>
            <p>Thanks for using ${APP_NAME}.</p>
            `.trim()
		};
	},
	applicationDeniedNotificationEmail: (
		candidateDetails: { firstName: string | null },
		details: { discipline: string; company: string }
	) => {
		const name = candidateDetails.firstName ?? 'there';
		return {
			subject: `Update on your application | ${APP_NAME}`,
			textEmail: `
            Hello ${name},

            Thank you for applying to the ${details.discipline} position at ${details.company}. This business has moved forward with another application. We hope to have more positions available soon — keep an eye on the job board for new openings.

            Thanks for using ${APP_NAME}.
            `,
			htmlEmail: `
            <p>Hello ${name},</p>
            <p>Thank you for applying to the <strong>${details.discipline}</strong> position at <strong>${details.company}</strong>. This business has moved forward with another application. We hope to have more positions available soon — keep an eye on the job board for new openings.</p>
            <p>Thanks for using ${APP_NAME}.</p>
            `.trim()
		};
	},
	timesheetVerificationNotificationEmail: (
		candidateDetails: { firstName: string; lastName: string },
		workdayDetails: {
			timesheetUrl: string;
			clientName: string;
			discipline: string;
			location: string;
			date: string;
			workdayStart: string;
			workdayEnd: string;
			requisitionNumber: string;
		}
	) => {
		return {
			textEmail: `
            Hello ${workdayDetails.clientName},

            A timesheet has been completed for Requisition Number: ${workdayDetails.requisitionNumber}. You can access and review the associated timesheet at ${workdayDetails.timesheetUrl}.
            
            Please accept or dispute by clicking "Approve" or "Reject". Any discrepancies will be addressed by a system administrator, prior to processing of any payments. 
            
            Note: If you have not validated and signed the stated invoice within 24 hours, the amount due may be charged to your form of payment currently on file.

            Thank you,
            Dental Temps Staffing Solutions`.trim(),
			htmlEmail: '',
			subject: `Timesheet Verification Needed | ${APP_NAME}`
		};
	},
	invoicePaymentProcessedNotificationEmail: (paymentDetails: {
		clientName: string;
		// Requisition-based invoices reference the requisition; one-off invoices fall
		// back to the invoice description. Both may be null (then we say neither).
		requisitionNumber?: string | null;
		description?: string | null;
		invoiceId: string;
		transactionAmount: string;
	}) => {
		const contact = contactClause('this payment');
		const invoiceUrl = `${BASE_URL}/invoices/${paymentDetails.invoiceId}`;
		// Requisition number for requisition-based invoices; the description for
		// one-offs; nothing if we have neither. The invoice link below always
		// carries the full details.
		const forClause = paymentDetails.requisitionNumber
			? ` for your requisition (Requisition #${paymentDetails.requisitionNumber})`
			: paymentDetails.description
				? ` for ${paymentDetails.description}`
				: '';
		return {
			textEmail: `
            Hello ${paymentDetails.clientName},

            A payment of ${paymentDetails.transactionAmount} was processed${forClause}.

            You can view the invoice details here: ${invoiceUrl}

            ${contact.text}

            Thank you,

            Dental Temps Staffing Solutions`,
			htmlEmail: `
            <p>Hello ${paymentDetails.clientName},</p>

            <p>A payment of <strong>${paymentDetails.transactionAmount}</strong> was processed${forClause}.</p>

            <p>You can <a href="${invoiceUrl}">view the invoice details here</a>.</p>

            ${contact.html}

            <p>Thank you,</p>
            <p>Dental Temps Staffing Solutions</p>
            `.trim(),
			subject: `Invoice Payment Processed | ${APP_NAME}`
		};
	},
	miscelaneousTransactionNotificationEmail: (transactionDetails: {
		clientName: string;
		transactionAmount: string;
		transactionType: string;
		transactionReason: string;
	}) => {
		return {
			textEmail: `
            Hello ${transactionDetails.clientName},

            A ${transactionDetails.transactionType} was processed with an amount of ${transactionDetails.transactionAmount}.

            The following reason was given for the ${transactionDetails.transactionType}:

            ${transactionDetails.transactionReason}

            For any questions about this charge, please contact us at ${env.COMPANY_REPLY_TO_EMAIL} or call us at ${env.COMPANY_PHONE_NUMBER}.

            Thank you,
            Dental Temps Staffing Solutions`,
			htmlEmail: `
            <p>Hello ${transactionDetails.clientName},</p>

            <p>A ${transactionDetails.transactionType} was processed with an amount of ${transactionDetails.transactionAmount}.</p>

            <p>The following reason was given for the ${transactionDetails.transactionType}:</p>

            <p>${transactionDetails.transactionReason}</p>

            <p>For any questions about this charge, please contact us at <a href="mailto:${env.COMPANY_REPLY_TO_EMAIL}">${env.COMPANY_REPLY_TO_EMAIL}</a> or call us at ${env.COMPANY_PHONE_NUMBER}.</p>

            <p>Thank you,</p>
            <p>Dental Temps Staffing Solutions</p>
            `.trim(),
			subject: `Miscellaneous Transaction Processed | ${APP_NAME}`
		};
	},
	invoiceVoidedNotificationEmail: (voidDetails: {
		clientName: string;
		invoiceNumber: string;
		reason: string;
	}) => {
		return {
			textEmail: `
            Hello ${voidDetails.clientName},

            Invoice ${voidDetails.invoiceNumber} has been voided and is no longer due.

            The following reason was given:

            ${voidDetails.reason}

            For any questions about this invoice, please contact us at ${env.COMPANY_REPLY_TO_EMAIL} or call us at ${env.COMPANY_PHONE_NUMBER}.

            Thank you,
            Dental Temps Staffing Solutions`,
			htmlEmail: `
            <p>Hello ${voidDetails.clientName},</p>

            <p>Invoice <strong>${voidDetails.invoiceNumber}</strong> has been voided and is no longer due.</p>

            <p>The following reason was given:</p>

            <p>${voidDetails.reason}</p>

            <p>For any questions about this invoice, please contact us at <a href="mailto:${env.COMPANY_REPLY_TO_EMAIL}">${env.COMPANY_REPLY_TO_EMAIL}</a> or call us at ${env.COMPANY_PHONE_NUMBER}.</p>

            <p>Thank you,</p>
            <p>Dental Temps Staffing Solutions</p>
            `.trim(),
			subject: `Invoice Voided | ${APP_NAME}`
		};
	},
	invoiceCreatedNotificationEmail: (invoiceDetails: {
		clientName: string;
		invoiceNumber: string;
		description: string | null;
		amount: string;
		dueDate: string | null;
		invoiceUrl: string;
		/** Stripe-backed invoices can be paid from the link; paper ones cannot. */
		isPayableOnline: boolean;
	}) => {
		const dueLine = invoiceDetails.dueDate ? `Due date: ${invoiceDetails.dueDate}` : '';
		const descriptionLine = invoiceDetails.description
			? `Description: ${invoiceDetails.description}`
			: '';
		const callToAction = invoiceDetails.isPayableOnline
			? 'You can view and pay this invoice online:'
			: 'You can view this invoice here:';
		const linkLabel = invoiceDetails.isPayableOnline ? 'View & Pay Invoice' : 'View Invoice';

		return {
			textEmail: `
            Hello ${invoiceDetails.clientName},

            A new invoice has been issued to your account.

            Invoice: ${invoiceDetails.invoiceNumber}
            Amount: ${invoiceDetails.amount}
            ${descriptionLine}
            ${dueLine}

            ${callToAction}
            ${invoiceDetails.invoiceUrl}

            For any questions about this invoice, please contact us at ${env.COMPANY_REPLY_TO_EMAIL} or call us at ${env.COMPANY_PHONE_NUMBER}.

            Thank you,
            Dental Temps Staffing Solutions`,
			htmlEmail: `
            <p>Hello ${invoiceDetails.clientName},</p>

            <p>A new invoice has been issued to your account.</p>

            <ul>
              <li><strong>Invoice:</strong> ${invoiceDetails.invoiceNumber}</li>
              <li><strong>Amount:</strong> ${invoiceDetails.amount}</li>
              ${invoiceDetails.description ? `<li><strong>Description:</strong> ${invoiceDetails.description}</li>` : ''}
              ${invoiceDetails.dueDate ? `<li><strong>Due date:</strong> ${invoiceDetails.dueDate}</li>` : ''}
            </ul>

            <p>${callToAction}</p>

            <p><a href="${invoiceDetails.invoiceUrl}">${linkLabel}</a></p>

            <p>For any questions about this invoice, please contact us at <a href="mailto:${env.COMPANY_REPLY_TO_EMAIL}">${env.COMPANY_REPLY_TO_EMAIL}</a> or call us at ${env.COMPANY_PHONE_NUMBER}.</p>

            <p>Thank you,</p>
            <p>Dental Temps Staffing Solutions</p>
            `.trim(),
			subject: `New Invoice ${invoiceDetails.invoiceNumber} | ${APP_NAME}`
		};
	},
	supportTicketSubmissionNotificationEmail: () => {
		return {
			textEmail: `
            Dear Admin User,

            A new Support Ticket has been submitted in the system. Login to the application to see the new ticket.
            `.trim(),
			htmlEmail: `
            <p>Dear Admin User,</p>

            <p>A new Support Ticket has been submitted in the system. Login to the application to see the new ticket.</p>
            `.trim(),
			subject: `New Support Ticket Submitted | ${APP_NAME}`
		};
	}
};
