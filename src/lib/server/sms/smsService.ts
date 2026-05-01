import twilio from 'twilio';
import { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER } from '$env/static/private';
import { SMS_TEMPLATES, type TemplateName, type TemplateVariables } from './templates';

export class TwilioService {
	private client: twilio.Twilio;
	private fromNumber: string;

	constructor() {
		this.client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
		this.fromNumber = TWILIO_PHONE_NUMBER;
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

		try {
			const message = await this.client.messages.create({
				body,
				from: this.fromNumber,
				to: this.formatPhoneNumber(to)
			});
			return { success: true, sid: message.sid };
		} catch (err) {
			console.error('Twilio send error:', err);
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
