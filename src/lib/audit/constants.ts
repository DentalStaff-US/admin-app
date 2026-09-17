// Vocabulary for the action_history ledger. Client-safe (no $lib/server
// imports) so Svelte components can render labels and filter options from the
// same source the writer validates against.

export const AUDIT_ACTIONS = [
	'VIEW',
	'DOWNLOAD',
	'CREATE',
	'UPDATE',
	'DELETE',
	'SUBMIT',
	'RESUBMIT',
	'APPROVE',
	'REJECT',
	'VOID',
	'CANCEL',
	'CLAIM',
	'APPLY',
	'ASSIGN',
	'UNASSIGN',
	'REASSIGN',
	'BLACKLIST',
	'STATUS_CHANGE',
	'PAYMENT_RECORDED',
	'PAYMENT_REVERSED',
	'EMAIL_SENT',
	'SIGN_IN',
	'SIGN_OUT',
	'IMPERSONATE_START',
	'IMPERSONATE_STOP'
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ENTITY_TYPES = [
	'REQUISITIONS',
	'RECURRENCE_DAYS',
	'REQUISITION_APPLICATIONS',
	'TIMESHEETS',
	'INVOICES',
	'SUPPORT_TICKETS',
	'CANDIDATES',
	'USERS'
] as const;
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

export const AUDIT_SOURCES = ['ADMIN_APP', 'CANDIDATE_APP', 'CRON', 'STRIPE', 'SYSTEM'] as const;
export type AuditSource = (typeof AUDIT_SOURCES)[number];

/** Past-tense verb for "{actor} {label} {entity}". */
export const ACTION_LABELS: Record<AuditAction, string> = {
	VIEW: 'viewed',
	DOWNLOAD: 'downloaded',
	CREATE: 'created',
	UPDATE: 'updated',
	DELETE: 'deleted',
	SUBMIT: 'submitted',
	RESUBMIT: 'resubmitted',
	APPROVE: 'approved',
	REJECT: 'rejected',
	VOID: 'voided',
	CANCEL: 'cancelled',
	CLAIM: 'claimed',
	APPLY: 'applied to',
	ASSIGN: 'assigned a professional to',
	UNASSIGN: 'unassigned a professional from',
	REASSIGN: 'reassigned',
	BLACKLIST: 'blacklisted a professional from',
	STATUS_CHANGE: 'changed the status of',
	PAYMENT_RECORDED: 'recorded a payment on',
	PAYMENT_REVERSED: 'reversed a payment on',
	EMAIL_SENT: 'email sent for',
	SIGN_IN: 'signed in',
	SIGN_OUT: 'signed out',
	IMPERSONATE_START: 'started impersonating',
	IMPERSONATE_STOP: 'stopped impersonating'
};

/** Human label for an entity type, singular. */
export const ENTITY_LABELS: Record<AuditEntityType, string> = {
	REQUISITIONS: 'requisition',
	RECURRENCE_DAYS: 'workday',
	REQUISITION_APPLICATIONS: 'application',
	TIMESHEETS: 'timesheet',
	INVOICES: 'invoice',
	SUPPORT_TICKETS: 'support ticket',
	CANDIDATES: 'professional',
	USERS: 'user'
};

export const SOURCE_LABELS: Record<AuditSource, string> = {
	ADMIN_APP: 'Admin app',
	CANDIDATE_APP: 'Professional app',
	CRON: 'Scheduled job',
	STRIPE: 'Stripe',
	SYSTEM: 'System'
};

/** A VIEW is recorded at most once per user per entity in this window. */
export const VIEW_THROTTLE_MS = 30 * 60 * 1000;

/**
 * Headers the candidate app sets on its server-to-server calls so the ledger
 * records the professional's browser, not the candidate-app server. Only
 * honoured on /api/external (JWT-authenticated) paths.
 */
export const FORWARDED_CLIENT_IP_HEADER = 'x-dtss-client-ip';
export const FORWARDED_CLIENT_UA_HEADER = 'x-dtss-client-ua';

/** One ledger row as rendered by the ActivityLog component. */
export type ActivityEntry = {
	id: string;
	createdAt: Date;
	action: string;
	entityType: string;
	entityId: string;
	userId: string | null;
	actorName: string | null;
	actorEmail: string | null;
	actorRole: string | null;
	impersonatedBy: string | null;
	impersonatorName: string | null;
	source: string | null;
	ipAddress: string | null;
	userAgent: string | null;
	requestPath: string | null;
	metadata: Record<string, unknown> | null;
	changes: { before?: Record<string, unknown>; after?: Record<string, unknown> } | null;
};
