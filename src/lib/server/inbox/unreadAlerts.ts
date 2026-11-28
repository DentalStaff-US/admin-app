import db from '$lib/server/database/drizzle';
import { notifyUnreadInboxMessages } from '$lib/server/notifications/transactional';
import { dueUnreadAlertsQuery, groupAlertsByRecipient, type DueUnreadAlert } from './alerts';

export async function runUnreadMessageAlerts(): Promise<{ recipients: number; conversations: number }> {
	const { rows } = await db.execute(dueUnreadAlertsQuery());
	const alerts = rows as unknown as DueUnreadAlert[];
	const byRecipient = groupAlertsByRecipient(alerts);
	await notifyUnreadInboxMessages(byRecipient);
	return { recipients: byRecipient.size, conversations: alerts.length };
}
