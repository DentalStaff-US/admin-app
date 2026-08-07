import { PUBLIC_MAPBOX_TOKEN } from '$env/static/public';
import { geocodeAddressWithToken, type GeocodedLocation } from './mapbox-core';

export type { GeocodedLocation };

/**
 * SvelteKit-facing geocoder. The implementation lives in mapbox-core.ts, which
 * takes the token as an argument and imports no `$env` — that keeps it usable
 * from CLI scripts run under tsx, where `$env/static/public` cannot resolve.
 */
export async function geocodeAddress(address: string): Promise<GeocodedLocation | null> {
	return geocodeAddressWithToken(address, PUBLIC_MAPBOX_TOKEN);
}
