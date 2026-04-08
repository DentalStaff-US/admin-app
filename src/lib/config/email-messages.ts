import sendEmail from '$lib/server/email-send';
import { APP_NAME } from '$lib/config/constants';
import { BASE_URL } from '$env/static/private';

// Send an email to verify the user's address
export const sendVerificationEmail = async (email: string, token: string) => {
	const verifyEmailURL = `${BASE_URL}/auth/verify/email-${token}`;
	const textEmail = `Please visit the link below to verify your email address for your ${APP_NAME} account.\n\n
    ${verifyEmailURL} \n\nIf you did not create this account, you can disregard this email.`;
	const htmlEmail = `<p>Please click this <a href="${verifyEmailURL}">link</a> to verify your email address for your ${APP_NAME} account.</p>  <p>You can also visit the link below.</p><p>${verifyEmailURL}</p><p>If you did not create this account, you can disregard this email.</p>`;
	const subject = `Please confirm your email address for ${APP_NAME}`;
	const resultSend = sendEmail(email, subject, htmlEmail, textEmail);
	return resultSend;
};

export const sendClientStaffInviteEmail = async (
	email: string,
	token: string,
	companyName: string
) => {
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

	try {
		const result = await sendEmail(email, subject, htmlEmail, textEmail);
		return { success: true, result };
	} catch (error) {
		console.error('Failed to send invite email:', error);
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Failed to send email'
		};
	}
};

// Send an email to welcome the new user
export const sendWelcomeEmail = async (email: string) => {
	const textEmail = `Thanks for verifying your account with ${APP_NAME}.\nYou can now sign in to your account at the link below.\n\n${BASE_URL}/auth/sign-in`;
	const htmlEmail = `<p>Thanks for verifying your account with ${APP_NAME}.</p><p>You can now <a href="${BASE_URL}/auth/sign-in">sign in</a> to your account.</p>`;
	const subject = `Welcome to ${APP_NAME}`;
	const resultSend = sendEmail(email, subject, htmlEmail, textEmail);
	return resultSend;
};

// Send an email to reset the user's password
export const sendPasswordResetEmail = async (email: string, token: string) => {
	const updatePasswordURL = `${BASE_URL}/auth/password/update-${token}`;
	const textEmail = `Please visit the link below to change your password for ${APP_NAME}.\n\n
    ${updatePasswordURL} \n\nIf you did not request to change your password, you can disregard this email.`;
	const htmlEmail = `<p>Please click this <a href="${updatePasswordURL}">link</a> to change your password for ${APP_NAME}.</p>
	<p>You can also visit the link below.</p><p>${updatePasswordURL}</p><p>If you did not request to change your password, you can disregard this email.</p>`;
	const subject = `Change your password for ${APP_NAME}`;
	const resultSend = sendEmail(email, subject, htmlEmail, textEmail);
	return resultSend;
};

// Send an email to confirm the user's password reset
// and also send an email to the user's old email account in case of a hijack attempt
export const updateEmailAddressSuccessEmail = async (
	email: string,
	oldEmail: string,
	token: string
) => {
	const verifyEmailURL = `${BASE_URL}/auth/verify/email-${token}`;
	const textEmail = `Please visit the link below to verify your email address for your ${APP_NAME} account.\n\n  ${verifyEmailURL}`;
	const htmlEmail = `<p>Please click this <a href="${verifyEmailURL}">link</a> to verify your email address for your ${APP_NAME} account.</p>  <p>You can also visit the link below.</p><p>${verifyEmailURL}</p>`;
	const subject = `Please confirm your email address for ${APP_NAME}`;
	sendEmail(email, subject, htmlEmail, textEmail);

	//send email to user about email change.
	const textEmailChange = `Your ${APP_NAME} account email has been updated from ${oldEmail} to ${email}.  If you DID NOT request this change, please contact support at: ${BASE_URL} to revert the changes.`;
	const htmlEmailChange = `<p>Your ${APP_NAME} account email has been updated from ${oldEmail} to ${email}.</p><p>If you DID NOT request this change, please contact support at: <a href='${BASE_URL}'>${BASE_URL}</a> to revert the changes.</p>`;
	const subjectChange = `Your email address for ${APP_NAME} has changed.`;
	sendEmail(oldEmail, subjectChange, htmlEmailChange, textEmailChange);
};
