import type { DisciplineSummary } from '$lib/_helpers/professional-filters';

/**
 * A professional as returned by `/api/requisitions/[id]/search-professionals`
 * and rendered by `ProfessionalSearch.svelte`.
 *
 * Lives here rather than in the server query module so client components can
 * import it without reaching into `$lib/server`. The server's
 * `searchProfessionalsForRequisition` returns this exact shape.
 */
export type ProfessionalSearchResult = {
	candidateId: string;
	firstName: string;
	lastName: string;
	email: string;
	avatarUrl: string | null;
	city: string | null;
	state: string | null;
	disciplines: DisciplineSummary[];
	/** Miles to the requisition's location, 1dp. Null when never geocoded. */
	distance: string | null;
	/**
	 * Dates (from the caller's `dates` option) this professional marked
	 * unavailable, with the reason. Empty when the caller asked about no dates.
	 *
	 * A WARNING, never a filter — the row is present either way. Same rule as the
	 * per-discipline `certBlocked` flag on `disciplines`.
	 */
	unavailableDates: Array<{ date: string; reason: 'blackout' | 'weekday' | 'booked' }>;
	isUnavailable: boolean;
};
