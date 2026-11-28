/**
 * Pure helpers for the admin communication and data screens (mass
 * notifications, record history, exports). Framework-free so they're tested.
 */

/** The fields of a mass campaign the screens read. */
export type CampaignRow = {
	id: string;
	name: string;
	audience: string;
	channel: string;
	status: string;
	subject?: string | null;
	body?: string;
	recipientCount: number;
	sentCount: number;
	failedCount: number;
	createdAt: string | Date;
};

export type CampaignRecipientRow = {
	id: string;
	firstName: string | null;
	lastName: string | null;
	toAddress: string;
	status: string;
	sentAt: string | Date | null;
	error: string | null;
};

export const AUDIENCE_LABELS: Record<string, string> = {
	CANDIDATE: 'Professionals',
	CLIENT: 'Practices'
};

export const CHANNEL_LABELS: Record<string, string> = {
	SMS: 'SMS',
	EMAIL: 'Email'
};

export const audienceLabel = (audience: string) => AUDIENCE_LABELS[audience] ?? audience;
export const channelLabel = (channel: string) => CHANNEL_LABELS[channel] ?? channel;

/** Recipients neither sent nor failed yet (never negative). */
export function campaignPending(c: Pick<CampaignRow, 'recipientCount' | 'sentCount' | 'failedCount'>): number {
	return Math.max(0, c.recipientCount - c.sentCount - c.failedCount);
}

/** Same rule the detail page has always used: only unfinished sends can be cancelled. */
export function canCancelCampaign(status: string): boolean {
	return ['QUEUED', 'SENDING', 'DRAFT'].includes(status);
}

/** Retry is offered once the campaign is finished and something failed. */
export function canRetryCampaign(c: Pick<CampaignRow, 'status' | 'failedCount'>): boolean {
	return c.failedCount > 0 && !canCancelCampaign(c.status);
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function recipientName(r: Pick<CampaignRecipientRow, 'firstName' | 'lastName'>): string {
	return [r.firstName, r.lastName].filter(Boolean).join(' ') || '—';
}

export function formatDateTime(d: string | Date | null | undefined): string {
	if (!d) return '—';
	return new Date(d).toLocaleString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		hour: 'numeric',
		minute: '2-digit'
	});
}

/** The CSV download URL for an export, with the optional inclusive date range. */
export function exportHref(key: string, from: string, to: string): string {
	const q = new URLSearchParams();
	if (from) q.set('from', from);
	if (to) q.set('to', to);
	const qs = q.toString();
	return `/admin/menu/exports/${key}${qs ? `?${qs}` : ''}`;
}

/** Record-history filters as they live in the URL. */
export type RecordHistoryFilters = {
	search: string;
	startDate: string;
	endDate: string;
	entityType: string;
	action: string;
	role: string;
	source: string;
};

export const RECORD_HISTORY_PATH = '/admin/menu/record-history';
export const RECORD_HISTORY_DEFAULT_PAGE_SIZE = 50;

/** The record-history URL for these filters and page (same params the load reads). */
export function recordHistoryUrl(filters: RecordHistoryFilters, page = 1, pageSize = RECORD_HISTORY_DEFAULT_PAGE_SIZE): string {
	const params = new URLSearchParams();
	for (const key of ['search', 'startDate', 'endDate', 'entityType', 'action', 'role', 'source'] as const) {
		const value = filters[key]?.trim();
		if (value) params.set(key, value);
	}
	if (page > 1) params.set('page', String(page));
	if (pageSize !== RECORD_HISTORY_DEFAULT_PAGE_SIZE) params.set('pageSize', String(pageSize));
	const qs = params.toString();
	return qs ? `${RECORD_HISTORY_PATH}?${qs}` : RECORD_HISTORY_PATH;
}

export function hasRecordHistoryFilters(filters: RecordHistoryFilters): boolean {
	return Object.values(filters).some((v) => !!v?.trim());
}

/** Shortens long entity ids for the table; the full id is in the details dialog. */
export function shortId(id: string, max = 18): string {
	return id.length > max ? `${id.slice(0, max)}…` : id;
}
