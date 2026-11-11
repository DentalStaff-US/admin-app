/**
 * Inbox helpers for the admin/practice portal: who a conversation is with,
 * search, relative times and the thread's day dividers. Same contract as the
 * professional app's features/inbox/conversation.ts, adapted for threads with
 * several participants. Framework-free; tested in inbox.test.ts.
 */

type Person = { id?: string; userId?: string; firstName?: string | null; lastName?: string | null; avatarUrl?: string | null };

/** The list endpoint nests the user (`{ userId, user: {...} }`); the thread endpoint is flat. Accept both. */
type Participant = Person & { user?: Person | null };

export type InboxConversation = {
	id: string;
	type?: string | null;
	participants?: Participant[] | null;
	applicationData?: {
		requisition?: { id?: number | string; disciplineName?: string | null; title?: string | null } | null;
		// The list endpoint selects { name, logo }; the thread endpoint the full company row.
		company?: { id?: string; companyName?: string | null; companyLogo?: string | null; name?: string | null; logo?: string | null } | null;
	} | null;
	/** CLIENT_CANDIDATE threads (conversations.company_id). */
	practice?: { id?: string; name?: string | null; logo?: string | null } | null;
	lastMessage?: { body?: string | null; createdAt?: string | Date | null } | null;
	unreadCount?: number | string | null;
};

export type ConversationSummary = {
	/** Who it's with: the other people, by name. */
	title: string;
	/** What it's about: the job or the practice, when there is one. */
	subtitle: string;
	avatarUrl: string | null;
	initials: string;
	/** A link to the job the conversation is about. */
	contextHref: string | null;
	/** More than one other person. */
	group: boolean;
};

export const fullName = (p: Person | null | undefined) => [p?.firstName, p?.lastName].filter(Boolean).join(' ');

const person = (p: Participant): Person => ({ ...p, ...(p.user ?? {}), userId: p.userId ?? p.user?.id ?? p.id });

/** Everyone in the conversation except the viewer. */
export function otherParticipants(conversation: InboxConversation, userId: string | undefined): Person[] {
	return (conversation.participants ?? []).map(person).filter((p) => p.userId !== userId);
}

export function initialsOf(text: string): string {
	return text
		.split(/[\s,]+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0].toUpperCase())
		.join('');
}

export function describeConversation(conversation: InboxConversation, userId: string | undefined): ConversationSummary {
	const others = otherParticipants(conversation, userId);
	const names = others.map(fullName).filter(Boolean);
	const title = names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', ') || 'DTSS team';

	let subtitle = '';
	let contextHref: string | null = null;
	const application = conversation.applicationData;
	if (application) {
		const job = application.requisition?.disciplineName || application.requisition?.title || 'Job application';
		const company = application.company?.companyName ?? application.company?.name;
		subtitle = [job, company].filter(Boolean).join(' · ');
		if (application.requisition?.id !== undefined && application.requisition?.id !== null) {
			contextHref = `/requisitions/${application.requisition.id}`;
		}
	} else if (conversation.practice?.name) {
		subtitle = conversation.practice.name;
	}

	return {
		title,
		subtitle,
		avatarUrl: others.length === 1 ? (others[0].avatarUrl ?? null) : null,
		initials: initialsOf(names[0] ?? title),
		contextHref,
		group: others.length > 1
	};
}

export const unreadOf = (c: InboxConversation) => Number(c.unreadCount ?? 0) || 0;

/** Search by name, job, practice or message text. */
export function filterConversations<T extends InboxConversation>(conversations: T[], query: string, userId: string | undefined): T[] {
	const needle = query.trim().toLowerCase();
	if (!needle) return conversations;
	return conversations.filter((c) => {
		const { title, subtitle } = describeConversation(c, userId);
		return [title, subtitle, c.lastMessage?.body ?? ''].join(' ').toLowerCase().includes(needle);
	});
}

export function relativeTime(value: string | Date | null | undefined, now: Date = new Date()): string {
	if (!value) return '';
	const date = new Date(value);
	const minutes = Math.floor((now.getTime() - date.getTime()) / 60000);
	if (isNaN(minutes)) return '';
	if (minutes < 1) return 'Just now';
	if (minutes < 60) return `${minutes}m ago`;
	if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h ago`;
	if (minutes < 7 * 24 * 60) return `${Math.floor(minutes / (24 * 60))}d ago`;
	return date.toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' })
	});
}

/** "Today", "Yesterday" or "Mon, Nov 3": the label above the first message of each day. */
export function dayLabel(value: string | Date, now: Date = new Date()): string {
	const date = new Date(value);
	const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
	const days = Math.round((startOf(now) - startOf(date)) / 864e5);
	if (days === 0) return 'Today';
	if (days === 1) return 'Yesterday';
	return date.toLocaleDateString('en-US', {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' })
	});
}

/** Whether a day divider goes above this message. */
export function startsNewDay(message: { createdAt: string | Date }, previous?: { createdAt: string | Date } | null): boolean {
	if (!previous) return true;
	return new Date(message.createdAt).toDateString() !== new Date(previous.createdAt).toDateString();
}

export const messageTime = (value: string | Date) =>
	new Date(value).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
