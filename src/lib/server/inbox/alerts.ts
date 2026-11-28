import { sql } from 'drizzle-orm';

/**
 * When someone hears about a message outside the app.
 *
 * A new conversation alerts straight away (email, plus a text if we have a number).
 * A reply never alerts when it's sent. It only alerts if it's still unread after
 * UNREAD_ALERT_DELAY_MINUTES, which is what keeps people who are in the conversation
 * out of their email: an open thread marks messages read as they arrive, on any app
 * or instance, so no presence tracking is needed.
 *
 * After an alert the conversation stays quiet until they've read it, and everything
 * due for one person in a run goes in one email.
 */
export const UNREAD_ALERT_DELAY_MINUTES = 15;

// Unread older than this is left alone, so old unread mail isn't announced on the
// first run after deploy. A cron outage shorter than this just alerts late.
export const UNREAD_ALERT_MAX_AGE_HOURS = 24;

export type DueUnreadAlert = { userId: string; conversationId: string; newestMessageId: number };

export function dueUnreadAlertsQuery() {
	return sql`
		SELECT
			p.user_id AS "userId",
			p.conversation_id AS "conversationId",
			max(m.id)::int AS "newestMessageId"
		FROM conversation_participants p
		JOIN messages m
			ON m.conversation_id = p.conversation_id
			AND m.id > greatest(coalesce(p.last_read_message_id, 0), coalesce(p.last_alerted_message_id, 0))
			AND m.sender_id <> p.user_id
			AND m.is_system_message IS NOT TRUE
			AND m.created_at > now() - make_interval(hours => ${UNREAD_ALERT_MAX_AGE_HOURS})
		WHERE p.is_active = true
			-- An alert they haven't read past yet: stay quiet until they do.
			AND coalesce(p.last_alerted_message_id, 0) <= coalesce(p.last_read_message_id, 0)
		GROUP BY p.user_id, p.conversation_id
		HAVING min(m.created_at) <= now() - make_interval(mins => ${UNREAD_ALERT_DELAY_MINUTES})
	`;
}

export function groupAlertsByRecipient(alerts: DueUnreadAlert[]): Map<string, DueUnreadAlert[]> {
	const byRecipient = new Map<string, DueUnreadAlert[]>();
	for (const alert of alerts) {
		byRecipient.set(alert.userId, [...(byRecipient.get(alert.userId) ?? []), alert]);
	}
	return byRecipient;
}
