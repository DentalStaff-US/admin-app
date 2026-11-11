/**
 * Non-metric copy for the dashboards (10 §5a): what actions do, why disabled ones
 * are disabled, and status meanings per audience. Metric hints live in metrics.ts.
 */

export const ACTION_HINTS = {
	approveTimesheet: 'Locks these hours and adds them to this week’s invoice.',
	approveDisabledStaff: 'Only your practice admin can approve timesheets.',
	postDisabled: 'Posting is paused until your account is approved.',
	postDisabledStaff: 'Only your practice admin or a manager can post requests.',
	findCoverage: 'Opens the request to assign or invite a professional.',
	reviewDiscrepancy: 'Submitted hours don’t match the schedule; compare and resolve them.',
	createInvoice: 'Opens the request’s invoices to bill the placement fee.',
	payInvoice: 'Opens the secure Stripe payment page in a new tab.',
	remind: 'Emails and texts the professional asking them to renew.',
	snooze: 'Hides this item for the chosen number of days. It returns if still unresolved.',
	coverageCell: 'Click to see who’s booked and what’s open.'
} as const;

/** Status hints by audience, until status.ts gains statusHint() (03 › Tooltip & InfoHint). */
export const STATUS_HINTS: Record<string, { admin: string; practice: string }> = {
	OPEN: {
		admin: 'Posted and not yet filled.',
		practice: 'Posted; we’re finding a professional.'
	},
	FILLED: {
		admin: 'A professional is booked.',
		practice: 'A professional is booked.'
	},
	UNFULFILLED: {
		admin: 'The shift date passed with nobody assigned.',
		practice: 'The shift date passed with nobody assigned.'
	},
	CANCELED: {
		admin: 'Cancelled; not billed.',
		practice: 'Cancelled; you won’t be billed.'
	},
	DISCREPANCY: {
		admin: 'Submitted hours don’t match the schedule; needs review.',
		practice: 'We’re checking these hours with the professional. No action needed from you.'
	},
	PENDING: {
		admin: 'Submitted and waiting for approval.',
		practice: 'Submitted and waiting for your approval.'
	},
	CRITICAL: {
		admin: 'Expired credential and booked on an upcoming shift. Can’t be snoozed.',
		practice: ''
	},
	BLOCKED: {
		admin: 'Expired credential; they can’t be booked until it’s renewed.',
		practice: ''
	},
	ACTION: {
		admin: 'Credential missing or in its grace period; needs follow-up.',
		practice: ''
	},
	WATCH: {
		admin: 'Credential expires soon.',
		practice: ''
	}
};

export function statusHint(status: string, audience: 'admin' | 'practice'): string | undefined {
	return STATUS_HINTS[status]?.[audience] || undefined;
}
