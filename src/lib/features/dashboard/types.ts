/**
 * Shapes shared by the dashboard loaders (server) and components (client).
 * Framework-free and DB-free, so both sides and the fixtures can import it.
 */
import type { StatusTone } from '$tokens/status';

/**
 * A number that may have failed to load. A failure renders "—", never 0
 * (10 §5 rule 5), so every dashboard query returns one of these.
 */
export type Metric<T> = { ok: true; value: T } | { ok: false };

export const ok = <T>(value: T): Metric<T> => ({ ok: true, value });
export const failed = <T = never>(): Metric<T> => ({ ok: false });

// ---------------------------------------------------------------------------
// Needs attention / Waiting on you (10 §3.1, §4.1)
// ---------------------------------------------------------------------------

export const ATTENTION_KINDS = [
	// DTSS admins
	'UNFILLED_SOON',
	'COMPLIANCE_CRITICAL',
	'COMPLIANCE_BLOCKED',
	'TIMESHEET_DISCREPANCY',
	'INVOICE_OVERDUE',
	'PERM_UNBILLED',
	'TIMESHEET_PENDING',
	'PERM_APPLICANTS_WAITING',
	'PRO_PENDING_APPROVAL',
	'CLIENT_PENDING_APPROVAL',
	'SUPPORT_OPEN',
	// Practices only
	'SIGNATURE_PENDING',
	'INVOICE_DUE',
	'STAFF_NO_LOCATION'
] as const;
export type AttentionKind = (typeof ATTENTION_KINDS)[number];

export const ATTENTION_CATEGORIES = ['shifts', 'timesheets', 'billing', 'people', 'support'] as const;
export type AttentionCategory = (typeof ATTENTION_CATEGORIES)[number];

/** An inline action posted as a form. Consequential ones carry their confirmation copy. */
export type AttentionForm = {
	action: string;
	fields: Record<string, string>;
	/** Present → ConfirmDialog naming the object and the consequence (03 › Which overlay). */
	confirm?: { title: string; description: string; confirmLabel: string };
};

export type AttentionAction = {
	label: string;
	href?: string;
	/** Opens in a new tab (signing links, hosted invoices). */
	external?: boolean;
	form?: AttentionForm;
	/** Shown instead of the action, with this explanation as its tooltip (03 › disabled actions). */
	disabledReason?: string;
	/** Tooltip for the action (what it does). */
	hint?: string;
};

export type AttentionItem = {
	/** Stable per row; also the key for optimistic removal. */
	id: string;
	kind: AttentionKind;
	/** From status.ts tones, never ad hoc. */
	tone: StatusTone;
	title: string;
	detail: string;
	/** Drives "3d" and the sort tiebreak. */
	since: Date;
	/** Shift start, invoice due date… */
	dueAt?: Date | null;
	/** The exact record, not a list. */
	href: string;
	action: AttentionAction;
	/** A second, quieter link (e.g. "Review" next to an inline Approve). */
	secondary?: { label: string; href: string };
	/** Shown when the scope covers more than one location (10 §4.2 rule 5). */
	location?: string | null;
	/** Muted note beside the action, e.g. "Waiting on Dana (owner)". */
	note?: string;
};

/**
 * One kind's result. `count` is COUNT(*) over the same WHERE as `items`, and
 * `items` is the first N rows of that set, so the chip and the list can't disagree.
 */
export type AttentionGroup = {
	kind: AttentionKind;
	result: Metric<{ count: number; items: AttentionItem[] }>;
};

// ---------------------------------------------------------------------------
// Scope (10 §4.2)
// ---------------------------------------------------------------------------

export type DashboardCapabilities = {
	approveTimesheets: boolean;
	postRequests: boolean;
	viewBilling: boolean;
	manageStaff: boolean;
};

export type ScopeLocation = { id: string; name: string };

export type DashboardScope = {
	/** all = DTSS admins; company = the whole practice; locations = a subset of it. */
	kind: 'all' | 'company' | 'locations';
	clientId: string | null;
	companyId: string | null;
	/** null = no location filter. [] = nothing (a scoped user with no assignments). */
	locationIds: string[] | null;
	/** The locations this scope covers, for the chip and the location column rule. */
	locations: ScopeLocation[];
	/** Every location the user could pick from (the owner's filter). */
	availableLocations: ScopeLocation[];
	/** True when the user chose the narrower scope themselves (owner filter). */
	chosen: boolean;
	label: string;
	can: DashboardCapabilities;
	/** Who approves when this user can't, for "Waiting on Dana (owner)". */
	ownerName: string | null;
	ownerEmail: string | null;
};

// ---------------------------------------------------------------------------
// KPIs, pipeline, receivables (10 §3.3, §3.4)
// ---------------------------------------------------------------------------

export const KPI_WINDOWS = ['week', 'month', '30d'] as const;
export type KpiWindow = (typeof KPI_WINDOWS)[number];

/** One value per day of the window; null where there's nothing to measure. */
export type Series = (number | null)[];

export type KpiValue = {
	current: number | null;
	previous: number | null;
	series: Series;
};

export type AdminKpis = {
	window: KpiWindow;
	fillRate: Metric<KpiValue>;
	timeToFill: Metric<KpiValue & { sample: number }>;
	billed: Metric<KpiValue>;
	wagesOwed: Metric<{ amount: number; count: number }>;
};

export type PipelineBucket = { count: number; wagesCents: number; marginCents: number; billingCents: number };
export type PipelineStatusKey = 'OPEN' | 'FILLED' | 'UNFULFILLED' | 'CANCELED';
export type ShiftPipeline = Record<PipelineStatusKey, PipelineBucket>;

export const AGEING_BUCKETS = ['current', '1-30', '31-60', '60+'] as const;
export type AgeingBucket = (typeof AGEING_BUCKETS)[number];
export type Receivables = Record<AgeingBucket, { count: number; amount: number }>;

export type PermPipeline = {
	open: number;
	interested: number;
	applied: number;
	recommended: number;
	hired: number;
};

// ---------------------------------------------------------------------------
// Coverage board (10 §3.2) and practice upcoming shifts (10 §4.1)
// ---------------------------------------------------------------------------

export type CoverageShift = {
	id: string;
	requisitionId: number;
	locationId: string;
	locationName: string;
	companyName: string;
	/** The shift's local date, 'YYYY-MM-DD' (recurrence_days.date). */
	date: string;
	dayStart: Date;
	dayEnd: Date;
	timezone: string;
	status: string;
	disciplineName: string;
	professionalName: string | null;
};

export type ComplianceSeverityKey = 'CRITICAL' | 'BLOCKED' | 'ACTION' | 'WATCH';

/** Money in flight for a practice, in dollars: what's waiting, owed, overdue and paid. */
export type PracticeBilling = {
	/** Open invoices, including overdue ones. */
	due: number;
	dueCount: number;
	overdue: number;
	overdueCount: number;
	paidThisMonth: number;
	/** Submitted timesheets waiting on the practice's approval (invoiced once approved). */
	timesheetsAwaiting: number;
	/** Expense claims on this practice's timesheets still waiting for a decision. */
	expensesPending: number;
	expensesPendingCount: number;
};
