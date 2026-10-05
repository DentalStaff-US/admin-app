/**
 * Administration Fee maths — the platform fee DTSS charges the practice, and the
 * optional per-timesheet override that can replace it.
 *
 * Pure and dependency-free: no DB, no env, no Stripe. The impure callers
 * (approveTimesheet.ts and the timesheet route's adminOverrideTimesheet action)
 * read `admin_config` and the timesheet row, then hand the values here.
 *
 * THE RULE:
 *   base   = REGULAR hours only. Overtime is exempt.
 *   fee    = round(base × percent / 100), or a flat dollar amount
 *   source = timesheet override ?? platform setting
 *
 * The override mirrors the SHAPE of the platform fee — an amount plus a type —
 * so an admin can agree either "35% for this sheet" or "$250 flat for this
 * sheet" regardless of how the platform is configured.
 *
 * A NULL override amount means "no override". An explicit 0 is a real,
 * negotiated value meaning the fee is WAIVED, and must never fall through to the
 * platform rate — which is why nothing in this module may use `||` on an amount.
 */

export type AdminFeeType = 'PERCENTAGE' | 'FIXED';
export type AdminFeeSource = 'OVERRIDE' | 'PLATFORM';

/** Bounds enforced by the route action; exported so tests and UI agree. */
export const ADMIN_FEE_MAX_PERCENT = 100;
export const ADMIN_FEE_MAX_FIXED = 100_000;

export type ResolvedAdminFee = {
	/** Percent when `type` is PERCENTAGE, whole dollars when FIXED. */
	amount: number;
	type: AdminFeeType;
	source: AdminFeeSource;
};

/**
 * Parse an amount that may arrive as a numeric-column string (node-postgres
 * returns `numeric` as a string), a number, or nothing.
 *
 * Returns null for null/undefined/blank — but an explicit 0 parses to 0, a real
 * rate. Same contract as `toRate` in affiliate/commission.ts, deliberately.
 */
function toAmount(value: string | number | null | undefined): number | null {
	if (value === null || value === undefined) return null;
	if (typeof value === 'string' && value.trim() === '') return null;
	const n = typeof value === 'number' ? value : parseFloat(value);
	if (!Number.isFinite(n) || n < 0) return null;
	return n;
}

/** Both type columns are `text`, so an unexpected value must not crash billing. */
function toFeeType(value: string | null | undefined): AdminFeeType | null {
	return value === 'PERCENTAGE' || value === 'FIXED' ? value : null;
}

function toFeeSource(value: string | null | undefined): AdminFeeSource | null {
	return value === 'OVERRIDE' || value === 'PLATFORM' ? value : null;
}

export type AdminFeeInputs = {
	/** `timesheets.admin_fee_override` — numeric(10,2), so a string from pg. */
	overrideAmount: string | number | null | undefined;
	/** `timesheets.admin_fee_type_override`. Absent means "same type as the platform". */
	overrideType: string | null | undefined;
	/** `admin_config.admin_payment_fee` — smallint. */
	platformAmount: string | number | null | undefined;
	/** `admin_config.admin_payment_fee_type`. */
	platformType: string | null | undefined;
};

/**
 * Most specific wins: a per-timesheet negotiated fee beats the platform setting.
 *
 * When an override amount is present but no override type, the platform's type
 * is inherited — that is what makes the override "reflect the platform setting"
 * for an admin who only edited the number.
 */
export function resolveAdminFee(input: AdminFeeInputs): ResolvedAdminFee {
	const platformType = toFeeType(input.platformType) ?? 'PERCENTAGE';

	const override = toAmount(input.overrideAmount);
	if (override !== null) {
		return {
			amount: override,
			type: toFeeType(input.overrideType) ?? platformType,
			source: 'OVERRIDE'
		};
	}

	return {
		amount: toAmount(input.platformAmount) ?? 0,
		type: platformType,
		source: 'PLATFORM'
	};
}

/**
 * Admin fee is charged on REGULAR hours only — overtime is exempt. Callers pass
 * `regularCents` (not the full billable amount) here.
 *
 * Moved verbatim from approveTimesheet.ts so the rounding that produced every
 * historical invoice is preserved exactly. Still exported (and re-exported from
 * approveTimesheet.ts) for existing call sites.
 */
export function calculateAdminFeeCents(
	regularCents: number,
	adminFee: number,
	adminFeeType: AdminFeeType
): number {
	if (!adminFee || adminFee <= 0) return 0;
	if (adminFeeType === 'PERCENTAGE') {
		return Math.round((regularCents * adminFee) / 100);
	}
	return Math.round(adminFee * 100);
}

export function adminFeeCentsFor(fee: ResolvedAdminFee, regularCents: number): number {
	return calculateAdminFeeCents(regularCents, fee.amount, fee.type);
}

/**
 * Label for the billing summary. Driven by `source` rather than by `amount > 0`
 * so a deliberately waived fee reads as waived instead of as "not configured".
 */
export function formatAdminFeeLabel(fee: ResolvedAdminFee): string {
	if (fee.amount <= 0) {
		return fee.source === 'OVERRIDE' ? 'Admin Fee (waived)' : 'Admin Fee';
	}
	// `amount` has been through parseFloat, so trailing zeros are already gone
	// ('37.50' from pg renders as 37.5).
	return fee.type === 'PERCENTAGE'
		? `Admin Fee (${fee.amount}%)`
		: `Admin Fee ($${fee.amount} flat)`;
}

/* -------------------------------------------------------------------------- */
/* The snapshot frozen onto the timesheet row at approval                     */
/* -------------------------------------------------------------------------- */

/**
 * What the invoice was actually built from. Persisted on the timesheet so a
 * later change to the platform fee — or an override entered after the client
 * already approved — can never rewrite what was really charged.
 */
export type AdminFeeSnapshot = {
	adminFeeApplied: string;
	adminFeeTypeApplied: AdminFeeType;
	adminFeeSource: AdminFeeSource;
};

/**
 * Written by `revertTimesheetToPending`. A sheet that is not APPROVED must carry
 * no snapshot, so a failed approval leaves no claim about what was billed.
 * The OVERRIDE columns are deliberately NOT cleared — the override is an admin
 * input, not an approval artifact.
 */
export const CLEARED_ADMIN_FEE_SNAPSHOT = {
	adminFeeApplied: null,
	adminFeeTypeApplied: null,
	adminFeeSource: null
} as const;

/** numeric(10,2) columns are written as strings in Drizzle. */
export function adminFeeAmountToColumn(amount: number): string {
	return amount.toFixed(2);
}

export function snapshotOf(fee: ResolvedAdminFee): AdminFeeSnapshot {
	return {
		adminFeeApplied: adminFeeAmountToColumn(fee.amount),
		adminFeeTypeApplied: fee.type,
		adminFeeSource: fee.source
	};
}

/**
 * The single entry point both approval paths use. Produces the cents and the
 * snapshot in one shot so they can never disagree.
 */
export function computeAdminFee(input: AdminFeeInputs & { regularCents: number }): {
	adminFeeCents: number;
	resolved: ResolvedAdminFee;
	snapshot: AdminFeeSnapshot;
} {
	const resolved = resolveAdminFee(input);
	return {
		adminFeeCents: adminFeeCentsFor(resolved, input.regularCents),
		resolved,
		snapshot: snapshotOf(resolved)
	};
}

/* -------------------------------------------------------------------------- */
/* Display                                                                    */
/* -------------------------------------------------------------------------- */

export type AdminFeeDisplayInputs = AdminFeeInputs & {
	appliedAmount: string | number | null | undefined;
	appliedType: string | null | undefined;
	appliedSource: string | null | undefined;
};

/**
 * What to SHOW for a timesheet: the frozen snapshot once one exists, otherwise
 * live resolution.
 *
 * `appliedSource` is the "a snapshot was taken" predicate. When it is null the
 * sheet is either unapproved (so the live override/platform pair is the honest
 * preview) or a legacy row approved before this feature shipped — and for those
 * the fall-through reproduces today's rendering exactly.
 */
export function resolveAdminFeeForDisplay(input: AdminFeeDisplayInputs): ResolvedAdminFee {
	const source = toFeeSource(input.appliedSource);
	if (source !== null) {
		return {
			amount: toAmount(input.appliedAmount) ?? 0,
			type: toFeeType(input.appliedType) ?? 'PERCENTAGE',
			source
		};
	}
	return resolveAdminFee(input);
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Bounds depend on the type: a percentage of labour above 100% is never
 * intended (this field exists to grant discounts), while a flat fee is a dollar
 * amount. Catches the realistic fat-finger of 3750 for 37.50.
 */
export function isAdminFeeOverrideInRange(amount: number, type: AdminFeeType): boolean {
	if (!Number.isFinite(amount) || amount < 0) return false;
	return amount <= (type === 'PERCENTAGE' ? ADMIN_FEE_MAX_PERCENT : ADMIN_FEE_MAX_FIXED);
}
