/**
 * Which locations a staff invite grants. Pure and client-safe: the picker and
 * the invite actions share it.
 */

/** Posted as `locationIds` to mean every location the practice has now. */
export const ALL_LOCATIONS = 'ALL';

export type InviteLocationsResult = { ok: true; locationIds: string[] } | { ok: false; message: string };

/**
 * The granted locations, primary first. `posted` is ALL_LOCATIONS or a JSON
 * array of ids; `owned` is the practice's own list, so an id from elsewhere is
 * refused. Without a usable primary the first granted location is it.
 */
export function resolveInviteLocations(
	posted: string | null | undefined,
	primaryId: string | null | undefined,
	owned: { id: string }[]
): InviteLocationsResult {
	const ownedIds = owned.map((l) => l.id);
	if (ownedIds.length === 0) return { ok: false, message: 'Add a location before inviting staff.' };

	let chosen: string[];
	if (posted === ALL_LOCATIONS) {
		chosen = ownedIds;
	} else {
		let parsed: unknown;
		try {
			parsed = JSON.parse(posted ?? '');
		} catch {
			parsed = null;
		}
		if (!Array.isArray(parsed) || parsed.length === 0) return { ok: false, message: 'Choose at least one location.' };
		chosen = [...new Set(parsed.map(String))];
		if (chosen.some((id) => !ownedIds.includes(id))) return { ok: false, message: 'Choose from your own locations.' };
	}

	const primary = primaryId && chosen.includes(primaryId) ? primaryId : chosen[0];
	return { ok: true, locationIds: [primary, ...chosen.filter((id) => id !== primary)] };
}

/** One row per invite: the query returns a row for each location it grants. */
export function groupInvites<T extends { id: string; locationName?: string | null }>(rows: T[]): T[] {
	const byId = new Map<string, T & { names: string[] }>();
	for (const row of rows) {
		const seen = byId.get(row.id) ?? { ...row, names: [] };
		if (row.locationName) seen.names.push(row.locationName);
		byId.set(row.id, seen);
	}
	return [...byId.values()].map(({ names, ...row }) => ({ ...row, locationName: names.join(', ') || null }) as unknown as T);
}
