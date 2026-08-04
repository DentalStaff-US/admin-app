/**
 * Client-identity masking for candidate-facing payloads.
 *
 * Practices don't want their name, address, or contact details reachable from a
 * shift listing a candidate hasn't claimed — that's the raw material for taking
 * a booking off-platform. Everything a candidate needs to *decide* (discipline,
 * rate, date/time, city, rough distance) stays; everything that identifies or
 * contacts the practice is removed **on the server**, so it never reaches the
 * browser and can't be recovered from a devtools payload.
 *
 * Unlock rule is per-shift (strictest):
 *   - temp shift  → the candidate holds a live workday on that recurrence day
 *                   (self-claimed or admin-assigned; cancelled doesn't count)
 *   - permanent   → the candidate's application for that requisition is APPROVED
 *
 * Callers build the masked payload explicitly rather than mutating rows, so a
 * new column on `client_companies` / `company_office_locations` can't silently
 * start leaking: the masked shapes below are allowlists.
 */

/** Coordinates are offset by 0.25–0.5 mi so a map shows an area, not a pin. */
const FUZZ_MIN_METERS = 400;
const FUZZ_RANGE_METERS = 400;
const METERS_PER_DEGREE_LAT = 111_320;

/** Radius (miles) the candidate UI should draw around a fuzzed point. */
export const APPROXIMATE_AREA_RADIUS_MILES = 0.75;

export type MaskedCompany = {
	id: null;
	name: null;
	logo: null;
	// The temp endpoints alias these as `name`/`logo`; the permanent ones spread
	// the whole `client_companies` row. Null both spellings so neither shape
	// leaks a value through the alias the other one uses.
	companyName: null;
	companyLogo: null;
	locked: true;
};

export type MaskedLocation = {
	id: null;
	name: null;
	completeAddress: null;
	streetOne: null;
	streetTwo: null;
	zip: null;
	zipcode: null;
	companyPhone: null;
	email: null;
	website: null;
	city: string | null;
	state: string | null;
	lat: string | null;
	lon: string | null;
	distanceMiles: number | null;
	approximate: true;
	approximateRadiusMiles: number;
	locked: true;
};

type LocationLike = {
	city?: string | null;
	state?: string | null;
	lat?: string | number | null;
	lon?: string | number | null;
	distanceMiles?: number | null;
	id?: string | null;
} | null;

/** FNV-1a — stable across processes so a location's fuzzed point never moves. */
function hashString(value: string): number {
	let hash = 2166136261;
	for (let i = 0; i < value.length; i++) {
		hash ^= value.charCodeAt(i);
		hash = Math.imul(hash, 16777619) >>> 0;
	}
	return hash >>> 0;
}

/**
 * Deterministic offset of 0.25–0.5 mi in a seeded direction. Deterministic
 * matters twice over: the circle doesn't jitter between page loads, and a
 * candidate can't average repeated reads back down to the true point.
 */
export function fuzzCoordinates(
	lat: string | number | null | undefined,
	lon: string | number | null | undefined,
	seed: string
): { lat: string | null; lon: string | null } {
	const latNum = typeof lat === 'string' ? parseFloat(lat) : lat;
	const lonNum = typeof lon === 'string' ? parseFloat(lon) : lon;
	if (latNum == null || lonNum == null || isNaN(latNum) || isNaN(lonNum)) {
		return { lat: null, lon: null };
	}

	const hash = hashString(seed);
	const angle = ((hash % 360) * Math.PI) / 180;
	const meters = FUZZ_MIN_METERS + ((hash >>> 9) % FUZZ_RANGE_METERS);

	const deltaLat = (meters * Math.cos(angle)) / METERS_PER_DEGREE_LAT;
	const deltaLon =
		(meters * Math.sin(angle)) / (METERS_PER_DEGREE_LAT * Math.cos((latNum * Math.PI) / 180));

	// 4dp ≈ 11 m, well inside the offset — no false precision to reverse.
	return {
		lat: (latNum + deltaLat).toFixed(4),
		lon: (lonNum + deltaLon).toFixed(4)
	};
}

/** Half-mile buckets — enough to judge a commute, too coarse to trilaterate. */
export function roundDistanceMiles(distanceMiles: number | null | undefined): number | null {
	if (distanceMiles == null || isNaN(distanceMiles)) return null;
	return Math.round(distanceMiles * 2) / 2;
}

export const maskedCompany: MaskedCompany = {
	id: null,
	name: null,
	logo: null,
	companyName: null,
	companyLogo: null,
	locked: true
};

/**
 * City/state, a half-mile-bucketed distance and a fuzzed point. Every
 * identifying or contactable field is nulled rather than omitted so existing
 * templates render an empty slot instead of throwing on `undefined`.
 */
export function maskLocation(location: LocationLike, seed: string): MaskedLocation {
	const { lat, lon } = fuzzCoordinates(location?.lat, location?.lon, seed);
	return {
		id: null,
		name: null,
		completeAddress: null,
		streetOne: null,
		streetTwo: null,
		zip: null,
		zipcode: null,
		companyPhone: null,
		email: null,
		website: null,
		city: location?.city ?? null,
		state: location?.state ?? null,
		lat,
		lon,
		distanceMiles: roundDistanceMiles(location?.distanceMiles),
		approximate: true,
		approximateRadiusMiles: APPROXIMATE_AREA_RADIUS_MILES,
		locked: true
	};
}

const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.]+/gi;
const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<]+/gi;
// 10-digit US numbers in any common separator style, with optional +1.
const PHONE_PATTERN = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;

export const CONTACT_REDACTED_LABEL = '[hidden until claimed]';

/**
 * Client-authored free text (job description) is the back door around masking —
 * "call Dr. Chen at 555-0134" defeats every nulled column above. Scrub the
 * contactable patterns while leaving the description readable.
 */
export function scrubContactDetails(text: string | null | undefined): string | null {
	if (!text) return text ?? null;
	return text
		.replace(EMAIL_PATTERN, CONTACT_REDACTED_LABEL)
		.replace(URL_PATTERN, CONTACT_REDACTED_LABEL)
		.replace(PHONE_PATTERN, CONTACT_REDACTED_LABEL);
}

/**
 * True when this candidate holds the shift — self-claimed or admin-assigned.
 * A cancelled workday does not unlock: the booking is gone, so the practice's
 * details go back behind the lock.
 */
export function isShiftUnlocked(
	workday: { id?: string | null; candidateId?: string | null; cancelledAt?: Date | null } | null,
	candidateProfileId: string
): boolean {
	return Boolean(workday?.id && workday.candidateId === candidateProfileId && !workday.cancelledAt);
}

/** Permanent postings have no shift to claim — an APPROVED application is the unlock. */
export function isApplicationUnlocked(
	application: { status?: string | null } | null | undefined
): boolean {
	return application?.status === 'APPROVED';
}

type ShiftRow = {
	requisition: { id: number; title?: string | null };
	company: unknown;
	location: LocationLike;
	workday: { id?: string | null; candidateId?: string | null; cancelledAt?: Date | null } | null;
};

/**
 * Shared masking for the temp-shift browse payloads (`getTempRequisitionsFor-
 * Candidate` and `getUpcomingTempRequisitionsForCandidate` return the same row
 * shape). `identityLocked` tells the candidate UI which card to render — it
 * never has to infer the state from missing fields.
 *
 * `requisition.title` is client-authored free text and routinely contains the
 * practice name, so it's dropped while locked; the UI shows `disciplineName`.
 */
export function maskShiftRowForCandidate<T extends ShiftRow>(shift: T, candidateProfileId: string) {
	if (isShiftUnlocked(shift.workday, candidateProfileId)) {
		return { ...shift, identityLocked: false };
	}

	return {
		...shift,
		requisition: { ...shift.requisition, title: null },
		company: maskedCompany,
		location: maskLocation(shift.location, shift.location?.id ?? `req-${shift.requisition.id}`),
		identityLocked: true
	};
}
