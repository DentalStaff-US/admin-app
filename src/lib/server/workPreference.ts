/**
 * Does this professional want to be shown temp work, permanent work, or both?
 *
 * THE DEFAULT IS BOTH. NULL means never answered, and never answered means show
 * everything — the same rule as availability, for the same reason: inaction must
 * never cost someone work, and every professional who existed before this column
 * has NULL.
 *
 * This is deliberately NOT a row-level filter. It maps onto
 * `requisitions.permanent_position`, which already splits the platform into two
 * whole listing paths, so the preference gates an ENTIRE board rather than
 * individual rows:
 *
 *   wantsTempWork      → the temp shift board (recurrence days) and its claim path
 *   wantsPermanentWork → the permanent openings board and its application path
 *
 * `wantsRequisition(pref, permanentPosition)` is the single predicate every call
 * site should use. Never compare the column directly: `pref === 'BOTH'` silently
 * excludes everyone who has never set it, which is most professionals, and
 * `pref !== 'PERMANENT'` quietly includes them — the two obvious shorthands fail in
 * opposite directions, which is exactly why this module exists.
 *
 * Pure and dependency-free so it can be used in queries, endpoints, notification
 * dispatch and tests alike.
 */

export const WORK_PREFERENCES = ['TEMP', 'PERMANENT', 'BOTH'] as const;

export type WorkPreference = (typeof WORK_PREFERENCES)[number];

/** NULL / undefined / anything unrecognised is treated as "never set" ⇒ BOTH. */
export type StoredWorkPreference = WorkPreference | null | undefined;

/** Has this professional actually answered? Drives "you haven't told us yet" copy. */
export function hasWorkPreference(pref: StoredWorkPreference): pref is WorkPreference {
	return pref === 'TEMP' || pref === 'PERMANENT' || pref === 'BOTH';
}

/**
 * The effective preference, with the default applied.
 *
 * An unrecognised value resolves to BOTH rather than throwing: a bad or
 * newly-added enum value must not be able to empty someone's job board.
 */
export function effectiveWorkPreference(pref: StoredWorkPreference): WorkPreference {
	return hasWorkPreference(pref) ? pref : 'BOTH';
}

/** Show them temp shifts? True unless they explicitly said permanent-only. */
export function wantsTempWork(pref: StoredWorkPreference): boolean {
	return effectiveWorkPreference(pref) !== 'PERMANENT';
}

/** Show them permanent openings? True unless they explicitly said temp-only. */
export function wantsPermanentWork(pref: StoredWorkPreference): boolean {
	return effectiveWorkPreference(pref) !== 'TEMP';
}

/**
 * THE predicate. One professional, one requisition's temp/perm nature.
 *
 * `permanentPosition` is `requisitions.permanent_position`. A null/undefined value
 * is treated as temp, matching the column's own default and how the listing
 * endpoints already read it.
 */
export function wantsRequisition(
	pref: StoredWorkPreference,
	permanentPosition: boolean | null | undefined
): boolean {
	return permanentPosition ? wantsPermanentWork(pref) : wantsTempWork(pref);
}

/** Sort, validate, and resolve a submitted value. `null` is an explicit reset. */
export function normalizeWorkPreference(
	input: unknown
): { ok: true; value: WorkPreference | null } | { ok: false; reason: 'INVALID' } {
	if (input === null || input === undefined || input === '') return { ok: true, value: null };
	if (typeof input !== 'string') return { ok: false, reason: 'INVALID' };
	const upper = input.toUpperCase();
	return WORK_PREFERENCES.includes(upper as WorkPreference)
		? { ok: true, value: upper as WorkPreference }
		: { ok: false, reason: 'INVALID' };
}

/** Second-person label for the professional's own settings. */
export const WORK_PREFERENCE_LABELS: Record<WorkPreference, string> = {
	TEMP: 'Temporary shifts only',
	PERMANENT: 'Permanent positions only',
	BOTH: 'Both temporary and permanent'
};

/** Short label for admin lists and badges. */
export const WORK_PREFERENCE_SHORT: Record<WorkPreference, string> = {
	TEMP: 'Temp only',
	PERMANENT: 'Permanent only',
	BOTH: 'Temp & permanent'
};

/**
 * Why a board is empty or short, for the banner that explains it.
 *
 * Returns null when the preference is not the reason — the caller then falls
 * through to its other explanations (no disciplines, cert-locked, nothing nearby),
 * which must not be overwritten by this one.
 */
export function workPreferenceExclusionReason(
	pref: StoredWorkPreference,
	board: 'TEMP' | 'PERMANENT'
): { preference: WorkPreference; message: string } | null {
	const effective = effectiveWorkPreference(pref);
	if (board === 'TEMP' && effective === 'PERMANENT') {
		return {
			preference: effective,
			message:
				"You're set to permanent positions only, so temporary shifts aren't shown. Change this in Settings → Edit Profile to see them."
		};
	}
	if (board === 'PERMANENT' && effective === 'TEMP') {
		return {
			preference: effective,
			message:
				"You're set to temporary shifts only, so permanent positions aren't shown. Change this in Settings → Edit Profile to see them."
		};
	}
	return null;
}
