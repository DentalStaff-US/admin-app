/**
 * Who gets told about a new message, and how.
 *
 * Email goes out when this is the recipient's only unread message in the conversation,
 * so a quick back-and-forth sends one email until they read it. SMS goes out only for
 * the first message of a conversation.
 */
export function inboxAlertPlan(input: { unreadBefore: number; isFirstMessage: boolean }) {
	return { email: input.unreadBefore === 0, sms: input.isFirstMessage };
}
