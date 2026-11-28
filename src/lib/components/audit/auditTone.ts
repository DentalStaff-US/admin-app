import type { StatusTone } from '$tokens/status';

/**
 * Ledger action → status tone, so the record-history badges and the activity
 * timeline dots speak the same status language as the rest of the app (01 › 3).
 * Reads are neutral, good outcomes positive, reversals negative, impersonation
 * a warning (someone acted as someone else), everything else info.
 */
export function auditActionTone(action: string): StatusTone {
	switch (action) {
		case 'VIEW':
		case 'DOWNLOAD':
		case 'SIGN_IN':
		case 'SIGN_OUT':
			return 'neutral';
		case 'CREATE':
		case 'APPROVE':
		case 'CLAIM':
		case 'ASSIGN':
		case 'PAYMENT_RECORDED':
			return 'positive';
		case 'DELETE':
		case 'REJECT':
		case 'VOID':
		case 'CANCEL':
		case 'BLACKLIST':
		case 'PAYMENT_REVERSED':
			return 'negative';
		case 'IMPERSONATE_START':
		case 'IMPERSONATE_STOP':
			return 'warning';
		case 'SNOOZE':
		case 'REMIND':
			return 'pending';
		default:
			return 'info';
	}
}

/** Before/after keys whose value changed, skipping the timestamps. */
export function changedFields(
	changes: { before?: Record<string, unknown>; after?: Record<string, unknown> } | null
): { key: string; before: unknown; after: unknown }[] {
	if (!changes) return [];
	const before = changes.before ?? {};
	const after = changes.after ?? {};
	const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
	const out: { key: string; before: unknown; after: unknown }[] = [];
	for (const key of keys) {
		if (key === 'updatedAt' || key === 'createdAt') continue;
		if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
			out.push({ key, before: before[key], after: after[key] });
		}
	}
	return out;
}

/** Metadata minus the internal/plumbing keys nobody needs to read. */
export function visibleMetadata(metadata: Record<string, unknown> | null): [string, unknown][] {
	if (!metadata) return [];
	return Object.entries(metadata).filter(([k]) => !k.startsWith('_') && k !== 'navigation');
}

export function displayValue(v: unknown): string {
	if (v === null || v === undefined) return '—';
	if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
	return JSON.stringify(v);
}
