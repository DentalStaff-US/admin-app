import twilio from 'twilio';
import { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER } from '$env/static/private';
import { env } from '$env/dynamic/private';
import { SMS_TEMPLATES, type TemplateName, type TemplateVariables } from './templates';
import { normalizeUSPhone, isValidUSPhone } from '$lib/_helpers/phone';

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

	// Thin instance methods so existing callers (e.g. the dispatcher's safeSms)
	// keep working. The actual normalization rules live in $lib/_helpers/phone
	// so the SMS sender, the zod form schemas, and any UI display formatter all
	// agree on what counts as a valid US number.
	formatPhoneNumber(phone: string | null | undefined): string | null {
		return normalizeUSPhone(phone);
	}

	isValidUSPhone(phone: string | null | undefined): boolean {
		return isValidUSPhone(phone);
	}

	async send({
		to,
		body
	}: {
		to: string;
		body: string;
	}): Promise<{ success: boolean; sid?: string; error?: string }> {
		const formattedTo = this.formatPhoneNumber(to);
		if (!formattedTo) {
			return { success: false, error: `Invalid US phone number: ${to}` };
		}

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
