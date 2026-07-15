// Centralized status-to-color mapping. Keep all resource statuses listed here
// so the table-cell badges, detail-page header badges, dashboard pills, and
// inline status spans across the admin app stay visually consistent.
//
// Palette uses the bg-100 / text-800 / border-200 family, which gives strong
// contrast on light page backgrounds without washing out (the previous mix
// included bg-500 fills with default white text and bg-200 fills that were
// nearly invisible).

export { default as StatusBadge } from './StatusBadge.svelte';

export type StatusKind = 'positive' | 'info' | 'pending' | 'warning' | 'negative' | 'neutral';

// Statuses are treated case-sensitively because the DB enums are mixed case
// (requisitions are uppercase; invoice statuses are lowercase). Map both
// forms where they collide.
const STATUS_KIND: Record<string, StatusKind> = {
	// Positive — completed successfully / healthy
	APPROVED: 'positive',
	ACTIVE: 'positive',
	paid: 'positive',
	WAGES_PAID: 'positive',
	FILLED: 'positive',
	SUCCESSFUL: 'positive',
	PAYMENT_RECEIVED: 'positive',

	// Informational — currently open / new
	OPEN: 'info',
	open: 'info',
	NEW: 'info',

	// Pending — needs human action soon
	PENDING: 'pending',

	// Warning — attention required, not yet bad
	DISCREPANCY: 'warning',
	UNFULFILLED: 'warning',
	WAGES_DUE: 'warning',
	PAYMENT_REQUIRED: 'warning',

	// Negative — failure / rejection / voided
	REJECTED: 'negative',
	DENIED: 'negative',
	FAILED: 'negative',
	uncollectible: 'negative',
	VOID: 'negative',
	void: 'negative',

	// Neutral — dormant / ended (gray means "no action expected")
	CLOSED: 'neutral',
	CANCELED: 'neutral',
	CANCELLED: 'neutral',
	INACTIVE: 'neutral',
	DRAFT: 'neutral',
	draft: 'neutral'
};

const KIND_CLASS: Record<StatusKind, string> = {
	positive: 'bg-green-100 text-green-800 border-green-200 hover:bg-green-200',
	info: 'bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-200',
	pending: 'bg-yellow-100 text-yellow-800 border-yellow-200 hover:bg-yellow-200',
	warning: 'bg-orange-100 text-orange-800 border-orange-200 hover:bg-orange-200',
	negative: 'bg-red-100 text-red-800 border-red-200 hover:bg-red-200',
	neutral: 'bg-gray-100 text-gray-800 border-gray-200 hover:bg-gray-200'
};

export function statusKind(status: string | null | undefined): StatusKind {
	if (!status) return 'neutral';
	return STATUS_KIND[status] ?? 'neutral';
}

export function statusBadgeClass(status: string | null | undefined): string {
	return KIND_CLASS[statusKind(status)];
}

// Format raw enum values for display (e.g. "WAGES_DUE" -> "Wages Due"). Pass
// the optional `label` prop to <StatusBadge> if you need a custom render.
export function statusLabel(status: string | null | undefined): string {
	if (!status) return '';
	// Voided reads better than the bare enum ("Void").
	if (status === 'void' || status === 'VOID') return 'Voided';
	return status
		.toString()
		.replace(/_/g, ' ')
		.toLowerCase()
		.replace(/\b\w/g, (c) => c.toUpperCase());
}
