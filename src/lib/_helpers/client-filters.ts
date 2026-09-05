import { CLIENT_STATUS, type ClientStatus } from '$lib/config/constants';

/**
 * Filter state for the clients index. Lives here rather than alongside the
 * query so both `+page.server.ts` and `+page.svelte` share one definition of
 * the URL contract and cannot drift. Mirrors `professional-filters.ts`.
 */
export type ClientFilters = {
	search?: string;
	status?: ClientStatus;
	cities?: string[];
	states?: string[];
	zipcodes?: string[];
};

/**
 * A client's office location as rendered in the clients table. Defined here
 * (rather than in the server query module) so client components can import it
 * without reaching into `$lib/server`.
 */
export type LocationSummary = {
	city: string | null;
	state: string | null;
};

/** Stable key for a location pill — a client can have several offices in one state. */
export function locationSummaryKey(location: LocationSummary): string {
	return `${location.city ?? ''}|${location.state ?? ''}`;
}

/** "Austin, TX" — falls back to whichever half is present. */
export function formatLocationSummary(location: LocationSummary): string {
	return [location.city, location.state].filter(Boolean).join(', ');
}

/** Query-string keys. Multi-value dimensions are comma separated. */
export const CLIENT_FILTER_PARAM = {
	search: 'search',
	status: 'status',
	city: 'city',
	state: 'state',
	zip: 'zip'
} as const;

export const DEFAULT_CLIENT_STATUS: ClientStatus = CLIENT_STATUS.ACTIVE;

/** Dimensions rendered as chips (status stays a tab). */
export const CLIENT_FILTER_DIMENSIONS = [
	{ key: 'city', param: CLIENT_FILTER_PARAM.city, label: 'City' },
	{ key: 'state', param: CLIENT_FILTER_PARAM.state, label: 'State' },
	{ key: 'zip', param: CLIENT_FILTER_PARAM.zip, label: 'Zip' }
] as const;

export type ClientFilterDimensionKey = (typeof CLIENT_FILTER_DIMENSIONS)[number]['key'];

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

export function parseClientFilters(searchParams: URLSearchParams): ClientFilters {
	const statusParam = searchParams.get(CLIENT_FILTER_PARAM.status)?.toUpperCase();
	const status: ClientStatus =
		statusParam && statusParam in CLIENT_STATUS
			? (statusParam as ClientStatus)
			: DEFAULT_CLIENT_STATUS;

	const search = searchParams.get(CLIENT_FILTER_PARAM.search)?.trim();

	return {
		search: search || undefined,
		status,
		cities: readList(searchParams, CLIENT_FILTER_PARAM.city),
		states: readList(searchParams, CLIENT_FILTER_PARAM.state),
		zipcodes: readList(searchParams, CLIENT_FILTER_PARAM.zip)
	};
}

export type ClientFilterChanges = {
	search?: string | null;
	status?: ClientStatus | null;
	city?: string[] | null;
	state?: string[] | null;
	zip?: string[] | null;
};

/**
 * Applies changes on top of the *current* params rather than rebuilding from
 * scratch, so unrelated params survive. The old clients page rebuilt the query
 * string from status + search alone, which would have silently dropped every
 * filter the moment someone typed in the search box.
 */
export function buildClientFiltersHref(
	current: URLSearchParams,
	changes: ClientFilterChanges = {},
	basePath = '/clients'
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
		if (next) params.set(CLIENT_FILTER_PARAM.search, next);
		else params.delete(CLIENT_FILTER_PARAM.search);
	}

	if (changes.status !== undefined) {
		if (changes.status && changes.status !== DEFAULT_CLIENT_STATUS) {
			params.set(CLIENT_FILTER_PARAM.status, changes.status);
		} else {
			params.delete(CLIENT_FILTER_PARAM.status);
		}
	}

	setList(CLIENT_FILTER_PARAM.city, changes.city);
	setList(CLIENT_FILTER_PARAM.state, changes.state);
	setList(CLIENT_FILTER_PARAM.zip, changes.zip);

	const query = params.toString();
	return query ? `${basePath}?${query}` : basePath;
}

export function hasActiveClientFilters(filters: ClientFilters): boolean {
	return Boolean(
		filters.search || filters.cities?.length || filters.states?.length || filters.zipcodes?.length
	);
}
