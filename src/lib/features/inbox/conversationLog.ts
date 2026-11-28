/**
 * The admin conversation log: what a row holds, the filters and their URL.
 * Framework-free; the queries are in $lib/server/inbox/conversationLog.
 */

export const CONVERSATION_LOG_PATH = '/admin/menu/conversations';

/**
 * Who a conversation is between, from its participants' roles. Not from
 * conversations.type: a thread started from the Inbox page is stored as
 * INTERNAL whoever is in it.
 */
export const CONVERSATION_BETWEEN = [
	{ value: 'PRACTICE_PRO', label: 'Practice and professional' },
	{ value: 'DTSS_PRACTICE', label: 'DTSS and practice' },
	{ value: 'DTSS_PRO', label: 'DTSS and professional' }
] as const;
export type ConversationBetween = (typeof CONVERSATION_BETWEEN)[number]['value'];

export type ConversationLogFilters = { search: string; between: '' | ConversationBetween };

export type ConversationLogRow = {
	id: string;
	updatedAt: Date | string;
	participants: { userId: string; name: string; role: string }[];
	practiceName: string | null;
	disciplineName: string | null;
	messageCount: number;
	lastMessage: { body: string; createdAt: Date | string; senderName: string } | null;
};

export function readConversationLogFilters(params: URLSearchParams): ConversationLogFilters {
	const between = params.get('between');
	return {
		search: (params.get('search') ?? '').trim(),
		between: CONVERSATION_BETWEEN.find((b) => b.value === between)?.value ?? ''
	};
}

export function conversationLogUrl(filters: ConversationLogFilters, page = 1): string {
	const params = new URLSearchParams();
	if (filters.search.trim()) params.set('search', filters.search.trim());
	if (filters.between) params.set('between', filters.between);
	if (page > 1) params.set('page', String(page));
	const qs = params.toString();
	return qs ? `${CONVERSATION_LOG_PATH}?${qs}` : CONVERSATION_LOG_PATH;
}

/** Only a path back into the log, so `?from=` can't send anyone elsewhere. */
export function conversationLogBack(from: string | null): string {
	return from && (from === CONVERSATION_LOG_PATH || from.startsWith(`${CONVERSATION_LOG_PATH}?`))
		? from
		: CONVERSATION_LOG_PATH;
}

/** `%` and `_` are wildcards in ILIKE; a search for them means the characters. */
export function likePattern(search: string): string {
	return `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
