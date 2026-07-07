import { json, type RequestHandler } from '@sveltejs/kit';
import { USER_ROLES } from '$lib/config/constants';
import { EmailService } from '$lib/server/email/emailService';
import { sms } from '$lib/server/sms/smsService';
import { renderTokens, textToHtml } from '$lib/server/campaigns/render';

const emailService = new EmailService();

// Send a single test message to the admin's own address before queueing a blast.
// Tokens render against the admin's name so they can eyeball personalization.
export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user;
	if (!user || user.role !== USER_ROLES.SUPERADMIN) {
		return json({ error: 'Unauthorized' }, { status: 403 });
	}

	const { channel, subject, body, testAddress } = (await request.json()) as {
		channel?: string;
		subject?: string;
		body?: string;
		testAddress?: string;
	};

	if (!body?.trim() || !testAddress?.trim()) {
		return json({ success: false, error: 'Message body and a test destination are required.' });
	}

	const rendered = renderTokens(body, { firstName: user.firstName, lastName: user.lastName });

	if (channel === 'EMAIL') {
		const res = await emailService.sendEmail({
			to: [{ email: testAddress.trim() }],
			subject: subject?.trim() || '(no subject)',
			html: textToHtml(rendered),
			text: rendered
		});
		return json({ success: res.success, error: res.error });
	}

	const res = await sms.send({ to: testAddress.trim(), body: rendered });
	return json({ success: res.success, error: res.error });
};
