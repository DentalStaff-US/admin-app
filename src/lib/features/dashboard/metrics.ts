/**
 * The metric contract (10 §5): one definition per number on a dashboard, with its
 * label, window, hint (tooltip) and the link to exactly the set it counts. Tiles
 * read their label and hint from here, so the words and the query can't drift.
 *
 * The queries live in `server/` and are keyed by the same ids. This file is
 * framework-free so components can import it.
 *
 * `kind` decides zero-state hiding (10 §3.7):
 *   - actionable: a count of work waiting on someone → hidden at zero.
 *   - informational: a KPI, rate, money total or a count with a target → always shown.
 * A failed metric is never hidden and never shows 0.
 */
import type { KpiWindow, Metric } from './types';
import { WINDOW_LABELS } from './window';

export type MetricKind = 'actionable' | 'informational';

export type MetricDef = {
	id: string;
	label: string;
	kind: MetricKind;
	/** 'kpi' = the shared KPI window; 'live' = a right-now count or balance. */
	window: 'kpi' | 'live' | 'month';
	/** One sentence: what the number means (03 › Tooltip & InfoHint). */
	hint: (windowLabel: string) => string;
	/** The list that shows exactly this set. null = no such list yet (see report). */
	href: string | null;
	/** For the trend arrow's colour. */
	goodWhenUp?: boolean;
};

export const METRICS = {
	// --- DTSS admins: KPI band -------------------------------------------
	fillRate: {
		id: 'fillRate',
		label: 'Fill rate',
		kind: 'informational',
		window: 'kpi',
		hint: (w) => `Shifts filled ÷ shifts that started ${w} (filled or unfulfilled).`,
		href: null,
		goodWhenUp: true
	},
	timeToFill: {
		id: 'timeToFill',
		label: 'Median time to fill',
		kind: 'informational',
		window: 'kpi',
		hint: (w) =>
			`Half of the shifts filled ${w} were claimed or assigned faster than this, from posting. Pre-arranged assignments are excluded.`,
		href: null,
		goodWhenUp: false
	},
	billed: {
		id: 'billed',
		label: 'Billed',
		kind: 'informational',
		window: 'kpi',
		hint: (w) => `Total of invoices raised ${w}, excluding drafts and voided invoices.`,
		href: '/invoices',
		goodWhenUp: true
	},
	wagesOwed: {
		id: 'wagesOwed',
		label: 'Wages owed',
		kind: 'informational',
		window: 'live',
		hint: () => 'Approved hours not yet paid to professionals, with overtime. Right now, not windowed.',
		href: '/timesheets?tab=approved&wages=WAGES_DUE'
	},
	// --- DTSS admins: pipeline and receivables ----------------------------
	pipelineBilling: {
		id: 'pipelineBilling',
		label: 'Est. billing',
		kind: 'informational',
		window: 'kpi',
		hint: () =>
			"What these shifts would invoice at the professional's rate plus the platform fee. Overtime isn't included.",
		href: '/requisitions'
	},
	pipelineMargin: {
		id: 'pipelineMargin',
		label: 'Margin',
		kind: 'informational',
		window: 'kpi',
		hint: () => 'The platform fee portion of the estimate.',
		href: '/requisitions'
	},
	receivables: {
		id: 'receivables',
		label: 'Receivables',
		kind: 'informational',
		window: 'live',
		hint: () => 'Open invoices by how far past their due date they are, by amount still owed.',
		href: '/invoices?tab=open'
	},
	permPipeline: {
		id: 'permPipeline',
		label: 'Permanent pipeline',
		kind: 'informational',
		window: 'live',
		hint: () => 'Open permanent requests and where their candidates are, right now.',
		href: '/requisitions'
	},
	// --- Practices: at a glance --------------------------------------------
	openRequests: {
		id: 'openRequests',
		label: 'Open requests',
		kind: 'informational',
		window: 'live',
		hint: () => 'Requests that are posted and still looking for professionals.',
		href: '/requisitions'
	},
	shiftsThisMonth: {
		id: 'shiftsThisMonth',
		label: 'Shifts this month',
		kind: 'informational',
		window: 'month',
		hint: () => "Shifts filled out of this month's scheduled shifts (cancelled ones aren't counted).",
		href: '/calendar'
	},
	balanceDue: {
		id: 'balanceDue',
		label: 'Balance due',
		kind: 'informational',
		window: 'live',
		hint: () => 'Unpaid invoices, including any past their due date.',
		href: '/invoices?tab=open'
	}
} satisfies Record<string, MetricDef>;

export type MetricId = keyof typeof METRICS;

export function metricHint(id: MetricId, window?: KpiWindow): string {
	const def: MetricDef = METRICS[id];
	return def.hint(window ? WINDOW_LABELS[window] : 'now');
}

/** The window text printed on a tile, so a screenshot can't be misread (10 §3.3). */
export function metricWindowText(id: MetricId, window?: KpiWindow): string {
	const def: MetricDef = METRICS[id];
	if (def.window === 'live') return 'right now';
	if (def.window === 'month') return 'this month';
	return window ? WINDOW_LABELS[window] : '';
}

/**
 * Zero-state rule (10 §3.7). Hidden only when the number is actionable, loaded,
 * and zero. Failures and informational numbers always show.
 */
export function hideWhenZero(kind: MetricKind, metric: Metric<number>): boolean {
	return kind === 'actionable' && metric.ok && metric.value === 0;
}

/** Shared copy for a failed number's tooltip (10 §5a). */
export const FAILED_HINT = "Couldn't load this number. Refresh to try again.";
