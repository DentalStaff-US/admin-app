import { STATES } from '$lib/config/constants';

/**
 * Granular address fields as stored on `candidate_profiles`.
 * `street` maps to the `address` column; the rest map 1:1.
 */
export type AddressComponents = {
	street: string | null;
	city: string | null;
	state: string | null; // always a 2-letter code
	zipcode: string | null; // always the 5-digit base, no +4
};

/**
 * `STATES` in constants.ts covers the 50 states only. Mapbox returns
 * "District of Columbia" for DC and full names for territories, so these are
 * folded in here rather than widening `STATES` — that array backs existing
 * state <select> dropdowns and changing its contents would change those forms.
 */
const EXTRA_STATE_ALIASES: Record<string, string> = {
	'district of columbia': 'DC',
	'washington dc': 'DC',
	'washington d.c.': 'DC',
	'puerto rico': 'PR',
	'virgin islands': 'VI',
	'u.s. virgin islands': 'VI',
	guam: 'GU',
	'american samoa': 'AS',
	'northern mariana islands': 'MP'
};

const STATE_LOOKUP: Map<string, string> = (() => {
	const map = new Map<string, string>();
	for (const { name, abbreviation } of STATES) {
		map.set(name.toLowerCase(), abbreviation);
		map.set(abbreviation.toLowerCase(), abbreviation);
	}
	for (const [name, abbreviation] of Object.entries(EXTRA_STATE_ALIASES)) {
		map.set(name, abbreviation);
		map.set(abbreviation.toLowerCase(), abbreviation);
	}
	return map;
})();

/** "Texas" | "texas" | "tx" | "TX" -> "TX". Returns null when unrecognized. */
export function normalizeState(input: string | null | undefined): string | null {
	if (!input) return null;
	const key = input.trim().toLowerCase().replace(/\s+/g, ' ');
	if (!key) return null;
	return STATE_LOOKUP.get(key) ?? null;
}

/** Normalizes a zip to its 5-digit base. "78701-1234" -> "78701". */
export function normalizeZip(input: string | null | undefined): string | null {
	if (!input) return null;
	const match = input.trim().match(/\b(\d{5})(?:-\d{4})?\b/);
	return match ? match[1] : null;
}

const COUNTRY_SEGMENT = /^(united states(\s+of\s+america)?|u\.?s\.?a?\.?)$/i;
const BARE_ZIP = /^\d{5}(?:-\d{4})?$/;
const TRAILING_STATE_ZIP = /^(.+?)[\s,]+(\d{5}(?:-\d{4})?)$/;

function clean(value: string | null | undefined): string | null {
	if (value === null || value === undefined) return null;
	const trimmed = value.trim().replace(/\s+/g, ' ');
	return trimmed.length ? trimmed : null;
}

/**
 * Extracts granular components from a formatted address string.
 *
 * Handles the two shapes that exist in our data:
 *   A. Mapbox `full_address` — "123 Main St, Austin, Texas 78701, United States"
 *   B. CSV-import composed   — "123 Main St, Apt 2, Austin, TX, 78701"
 *      (see composeCompleteAddress / backfill-csv-import.ts)
 *
 * Returns null unless BOTH city and state resolve — a partial guess is worse
 * than no data for filtering, and the caller falls back to geocoding.
 */
export function parseCompleteAddress(
	complete: string | null | undefined
): AddressComponents | null {
	const input = clean(complete);
	if (!input) return null;

	const segments = input
		.split(',')
		.map((segment) => clean(segment))
		.filter((segment): segment is string => segment !== null);

	if (!segments.length) return null;

	// Drop a trailing country segment if present.
	if (COUNTRY_SEGMENT.test(segments[segments.length - 1])) {
		segments.pop();
	}
	if (!segments.length) return null;

	let state: string | null = null;
	let zipcode: string | null = null;

	const last = segments[segments.length - 1];

	if (BARE_ZIP.test(last)) {
		// Shape B: state and zip are separate segments.
		zipcode = normalizeZip(segments.pop() as string);
		if (segments.length) {
			const maybeState = normalizeState(segments[segments.length - 1]);
			if (maybeState) {
				state = maybeState;
				segments.pop();
			}
		}
	} else {
		const stateZip = last.match(TRAILING_STATE_ZIP);
		if (stateZip) {
			// Shape A: "Texas 78701" in one segment.
			const maybeState = normalizeState(stateZip[1]);
			if (maybeState) {
				state = maybeState;
				zipcode = normalizeZip(stateZip[2]);
				segments.pop();
			}
		} else {
			const maybeState = normalizeState(last);
			if (maybeState) {
				state = maybeState;
				segments.pop();
			}
		}
	}

	if (!state) return null;

	const city = segments.length ? (segments.pop() as string) : null;
	if (!city) return null;

	const street = segments.length ? segments.join(', ') : null;

	return { street, city, state, zipcode };
}

/**
 * Builds a formatted address from granular parts. Mirrors the join used by
 * backfill-csv-import.ts so the two representations cannot drift.
 */
export function composeCompleteAddress(parts: {
	street?: string | null;
	streetTwo?: string | null;
	city?: string | null;
	state?: string | null;
	zipcode?: string | null;
}): string | null {
	const composed = [parts.street, parts.streetTwo, parts.city, parts.state, parts.zipcode]
		.map((part) => clean(part))
		.filter(Boolean)
		.join(', ');
	return composed.length ? composed : null;
}

/**
 * Form payloads in this app routinely carry the literal string "undefined"
 * for unset hidden inputs; treat that (and blanks) as absent.
 */
export function cleanFormValue(value: string | null | undefined): string | null {
	const trimmed = clean(value);
	if (!trimmed || trimmed === 'undefined' || trimmed === 'null') return null;
	return trimmed;
}

export type AddressResolution = AddressComponents & {
	/** True when components could not be fully resolved and a geocode should be queued. */
	needsGeocode: boolean;
};

/**
 * The sync guarantee: every candidate-address write path runs through this so
 * `address` / `city` / `state` / `zipcode` stay consistent with `complete_address`.
 *
 * Explicitly supplied components (from the Mapbox picker) win; anything missing
 * is filled by parsing `completeAddress`. All four fields are always returned,
 * so callers that spread the result naturally clear values that have gone stale
 * after an address change rather than leaving a wrong city behind.
 */
export function resolveAddressComponents(input: {
	completeAddress?: string | null;
	components?: Partial<AddressComponents> | null;
}): AddressResolution {
	const supplied = input.components ?? {};
	const parsed = parseCompleteAddress(input.completeAddress);

	const street = clean(supplied.street) ?? parsed?.street ?? null;
	const city = clean(supplied.city) ?? parsed?.city ?? null;
	const state = normalizeState(supplied.state) ?? parsed?.state ?? null;
	const zipcode = normalizeZip(supplied.zipcode) ?? parsed?.zipcode ?? null;

	const hasCompleteAddress = clean(input.completeAddress) !== null;
	const needsGeocode = hasCompleteAddress && !(city && state && zipcode);

	return { street, city, state, zipcode, needsGeocode };
}

/**
 * Convenience mapper from a resolution to the `candidate_profiles` column names
 * (`street` is stored in the `address` column).
 */
export function addressComponentsToProfilePatch(components: AddressComponents) {
	return {
		address: components.street,
		city: components.city,
		state: components.state,
		zipcode: components.zipcode
	};
}

/**
 * Normalizes the address portion of a candidate profile payload coming off a
 * form or the external API. Returns an empty patch when the payload carries no
 * address, so a partial update never blanks the stored one.
 */
export function buildCandidateAddressPatch(payload: {
	completeAddress?: string | null;
	address?: string | null;
	city?: string | null;
	state?: string | null;
	zipcode?: string | null;
}): {
	patch: Partial<ReturnType<typeof addressComponentsToProfilePatch>>;
	needsGeocode: boolean;
	completeAddress: string | null;
} {
	const completeAddress = cleanFormValue(payload.completeAddress);
	if (!completeAddress) {
		return { patch: {}, needsGeocode: false, completeAddress: null };
	}

	const resolved = resolveAddressComponents({
		completeAddress,
		components: {
			street: cleanFormValue(payload.address),
			city: cleanFormValue(payload.city),
			state: cleanFormValue(payload.state),
			zipcode: cleanFormValue(payload.zipcode)
		}
	});

	return {
		patch: addressComponentsToProfilePatch(resolved),
		needsGeocode: resolved.needsGeocode,
		completeAddress
	};
}
