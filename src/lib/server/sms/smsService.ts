import twilio from 'twilio';
import { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER } from '$env/static/private';
import { env } from '$env/dynamic/private';
import { SMS_TEMPLATES, type TemplateName, type TemplateVariables } from './templates';

export class TwilioService {
	private client: twilio.Twilio;
	private fromNumber: string;
	// Optional. When set, sends are routed through the A2P 10DLC Messaging
	// Service instead of the bare from-number — required for compliant
	// production traffic. See https://www.twilio.com/docs/errors/21606.
	private messagingServiceSid: string | undefined;

	constructor() {
		this.client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
		this.fromNumber = TWILIO_PHONE_NUMBER;
		this.messagingServiceSid = env.TWILIO_MESSAGING_SERVICE_SID || undefined;
	}

	formatPhoneNumber(phone: string): string {
		const digits = phone.replace(/\D/g, '');
		return `+1${digits}`;
	}

	isValidUSPhone(phone: string): boolean {
		const digits = phone.replace(/\D/g, '');
		return /^\d{10}$/.test(digits);
	}

	async send({
		to,
		body
	}: {
		to: string;
		body: string;
	}): Promise<{ success: boolean; sid?: string; error?: string }> {
		if (!this.isValidUSPhone(to)) {
			return { success: false, error: `Invalid US phone number: ${to}` };
		}

		const formattedTo = this.formatPhoneNumber(to);

		try {
			const message = await this.client.messages.create({
				body,
				to: formattedTo,
				...(this.messagingServiceSid
					? { messagingServiceSid: this.messagingServiceSid }
					: { from: this.fromNumber })
			});
			return { success: true, sid: message.sid };
		} catch (err) {
			console.error(`Twilio send error (to=${formattedTo}):`, err);
			return { success: false, error: String(err) };
		}
	}

	async sendTemplated<T extends TemplateName>(
		...[to, template, variables]: TemplateVariables[T] extends undefined
			? [string, T]
			: [string, T, TemplateVariables[T]]
	): Promise<{ success: boolean; sid?: string; error?: string }> {
		const fn = SMS_TEMPLATES[template] as (vars?: any) => { textMessage: string };
		const { textMessage } = fn(variables);
		return this.send({ to, body: textMessage });
	}
}

export const sms = new TwilioService();
