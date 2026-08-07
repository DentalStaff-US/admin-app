import { CANDIDATE_STATUS, type CandidateStatus } from '$lib/config/constants';

/**
 * Filter state for the professionals index. Lives here rather than alongside
 * the query so both `+page.server.ts` and `+page.svelte` share one definition
 * of the URL contract and cannot drift.
 */
export type ProfessionalFilters = {
	search?: string;
	status?: CandidateStatus;
	disciplineIds?: string[];
	cities?: string[];
	states?: string[];
	zipcodes?: string[];
};

/**
 * A discipline as rendered in the professionals table. Defined here (rather
 * than in the server query module) so client components can import it without
 * reaching into `$lib/server`.
 */
export type DisciplineSummary = {
	id: string;
	name: string;
	abbreviation: string;
};

/** Query-string keys. Multi-value dimensions are comma separated. */
export const PROFESSIONAL_FILTER_PARAM = {
	search: 'search',
	status: 'status',
	discipline: 'discipline',
	city: 'city',
	state: 'state',
	zip: 'zip'
} as const;

export const DEFAULT_PROFESSIONAL_STATUS: CandidateStatus = CANDIDATE_STATUS.ACTIVE;

/** Dimensions rendered as chips (status stays a tab). */
export const PROFESSIONAL_FILTER_DIMENSIONS = [
	{ key: 'discipline', param: PROFESSIONAL_FILTER_PARAM.discipline, label: 'Discipline' },
	{ key: 'city', param: PROFESSIONAL_FILTER_PARAM.city, label: 'City' },
	{ key: 'state', param: PROFESSIONAL_FILTER_PARAM.state, label: 'State' },
	{ key: 'zip', param: PROFESSIONAL_FILTER_PARAM.zip, label: 'Zip' }
] as const;

export type ProfessionalFilterDimensionKey = (typeof PROFESSIONAL_FILTER_DIMENSIONS)[number]['key'];

/**
 * Reads a repeatable, comma-separated multi-value param.
 * Accepts both `?city=Austin,Dallas` and `?city=Austin&city=Dallas`.
 */
function readList(searchParams: URLSearchParams, key: string): string[] {
	const values = searchParams
		.getAll(key)
		.flatMap((raw) => raw.split(','))
		.map((value) => value.trim())
		.filter(Boolean);

	return Array.from(new Set(values));
}

export function parseProfessionalFilters(searchParams: URLSearchParams): ProfessionalFilters {
	const statusParam = searchParams.get(PROFESSIONAL_FILTER_PARAM.status)?.toUpperCase();
	const status: CandidateStatus =
		statusParam && statusParam in CANDIDATE_STATUS
			? (statusParam as CandidateStatus)
			: DEFAULT_PROFESSIONAL_STATUS;

	const search = searchParams.get(PROFESSIONAL_FILTER_PARAM.search)?.trim();

	return {
		search: search || undefined,
		status,
		disciplineIds: readList(searchParams, PROFESSIONAL_FILTER_PARAM.discipline),
		cities: readList(searchParams, PROFESSIONAL_FILTER_PARAM.city),
		states: readList(searchParams, PROFESSIONAL_FILTER_PARAM.state),
		zipcodes: readList(searchParams, PROFESSIONAL_FILTER_PARAM.zip)
	};
}

export type ProfessionalFilterChanges = {
	search?: string | null;
	status?: CandidateStatus | null;
	discipline?: string[] | null;
	city?: string[] | null;
	state?: string[] | null;
	zip?: string[] | null;
};

/**
 * Applies changes on top of the *current* params rather than rebuilding from
 * scratch, so unrelated params survive. Empty/default values are dropped to
 * keep shared links readable.
 */
export function buildProfessionalFiltersHref(
	current: URLSearchParams,
	changes: ProfessionalFilterChanges = {},
	basePath = '/professionals'
): string {
	const params = new URLSearchParams(current.toString());

	const setList = (key: string, values: string[] | null | undefined) => {
		if (values === undefined) return;
		params.delete(key);
		if (values && values.length) {
			params.set(key, Array.from(new Set(values)).join(','));
		}
	};

	if (changes.search !== undefined) {
		const next = changes.search?.trim();
		if (next) params.set(PROFESSIONAL_FILTER_PARAM.search, next);
		else params.delete(PROFESSIONAL_FILTER_PARAM.search);
	}

	if (changes.status !== undefined) {
		if (changes.status && changes.status !== DEFAULT_PROFESSIONAL_STATUS) {
			params.set(PROFESSIONAL_FILTER_PARAM.status, changes.status);
		} else {
			params.delete(PROFESSIONAL_FILTER_PARAM.status);
		}
	}

	setList(PROFESSIONAL_FILTER_PARAM.discipline, changes.discipline);
	setList(PROFESSIONAL_FILTER_PARAM.city, changes.city);
	setList(PROFESSIONAL_FILTER_PARAM.state, changes.state);
	setList(PROFESSIONAL_FILTER_PARAM.zip, changes.zip);

	const query = params.toString();
	return query ? `${basePath}?${query}` : basePath;
}

export function hasActiveProfessionalFilters(filters: ProfessionalFilters): boolean {
	return Boolean(
		filters.search ||
			filters.disciplineIds?.length ||
			filters.cities?.length ||
			filters.states?.length ||
			filters.zipcodes?.length
	);
}
