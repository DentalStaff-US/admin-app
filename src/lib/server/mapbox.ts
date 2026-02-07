import { PUBLIC_MAPBOX_TOKEN } from '$env/static/public';

interface MapboxV6Feature {
	type: 'Feature';
	geometry: {
		type: 'Point';
		coordinates: [number, number]; // [lng, lat]
	};
	properties: {
		mapbox_id: string;
		feature_type: string;
		full_address?: string;
		name?: string;
		name_preferred?: string;
		place_formatted?: string;
		address_number?: string;
		street?: string;
		postcode?: string;
		context?: {
			country?: {
				name: string;
				country_code: string;
				country_code_alpha_3: string;
			};
			region?: {
				name: string;
				region_code: string;
				region_code_alpha_3?: string;
			};
			state?: {
				name: string;
				state_code?: string;
			};
			postcode?: {
				name: string;
			};
			place?: {
				name: string;
			};
			locality?: {
				name: string;
			};
			neighborhood?: {
				name: string;
			};
			street?: {
				name: string;
			};
			address?: {
				name: string;
				address_number?: string;
				street_name?: string;
			};
		};
	};
}

interface MapboxV6GeocodeResponse {
	type: 'FeatureCollection';
	features: MapboxV6Feature[];
	attribution: string;
}

interface GeocodedLocation {
	lat: number;
	lon: number;
	timezone: string;
	formattedAddress: string;
}

export async function geocodeAddress(address: string): Promise<GeocodedLocation | null> {
	if (!address || !address.trim()) {
		return null;
	}

	try {
		const params = new URLSearchParams({
			q: address,
			access_token: PUBLIC_MAPBOX_TOKEN,
			limit: '1',
			country: 'us',
			types: 'address,secondary_address'
		});

		const url = `https://api.mapbox.com/search/geocode/v6/forward?${params}`;

		const response = await fetch(url);

		if (!response.ok) {
			console.error('Mapbox v6 geocoding failed:', response.statusText);
			return null;
		}

		const data: MapboxV6GeocodeResponse = await response.json();

		if (!data.features || data.features.length === 0) {
			console.error('No results found for address:', address);
			return null;
		}

		const feature = data.features[0];
		const [lon, lat] = feature.geometry.coordinates;
		const props = feature.properties;
		const context = props.context;

		// Debug: Log the full response
		console.log('=== Geocoding Debug ===');
		console.log('Address:', address);
		console.log('Coordinates:', { lat, lon });
		console.log('Context:', JSON.stringify(context, null, 2));

		// Get timezone from context
		const timezone = getTimezoneFromContext(lat, lon, context);

		console.log('Determined timezone:', timezone);
		console.log('======================');

		// Use the best available formatted address
		const formattedAddress =
			props.full_address || props.place_formatted || props.name_preferred || props.name || address;

		return {
			lat,
			lon,
			timezone,
			formattedAddress
		};
	} catch (error) {
		console.error('Error geocoding address:', error);
		return null;
	}
}

// Get timezone from v6 context structure
function getTimezoneFromContext(
	lat: number,
	lon: number,
	context?: MapboxV6Feature['properties']['context']
): string {
	if (!context) {
		console.log('No context provided, using longitude fallback');
		return getApproximateTimezone(lon);
	}

	// Try to extract state code
	let stateCode: string | undefined;
	let stateName: string | undefined;

	// Check region first (most common)
	if (context.region) {
		stateName = context.region.name;
		stateCode = context.region.region_code;

		// Handle formats like "US-WA" or "WA"
		if (stateCode) {
			if (stateCode.includes('-')) {
				const parts = stateCode.split('-');
				stateCode = parts[parts.length - 1]; // Take the last part (state code)
			}
			stateCode = stateCode.toUpperCase();
		}
	}

	// Fallback to state if region not found
	if (!stateCode && context.state) {
		stateName = context.state.name;
		stateCode = context.state.state_code?.toUpperCase();
	}

	console.log('Extracted state:', {
		stateName,
		stateCode,
		rawRegion: context.region,
		rawState: context.state
	});

	// US State-based timezone mapping
	if (stateCode) {
		const timezone = US_STATE_TIMEZONES[stateCode];
		if (timezone) {
			console.log(`✓ Matched state code "${stateCode}" to timezone "${timezone}"`);
			return timezone;
		} else {
			console.warn(`✗ Unknown state code "${stateCode}", falling back to longitude`);
		}
	}

	// Fallback: Use longitude-based approximation
	console.log('No state match, using longitude-based fallback');
	const fallbackTimezone = getApproximateTimezone(lon);
	console.log(`Longitude ${lon} mapped to ${fallbackTimezone}`);
	return fallbackTimezone;
}

// US State timezone mappings
const US_STATE_TIMEZONES: Record<string, string> = {
	// Pacific Time
	CA: 'America/Los_Angeles',
	NV: 'America/Los_Angeles',
	OR: 'America/Los_Angeles',
	WA: 'America/Los_Angeles',

	// Mountain Time
	AZ: 'America/Phoenix', // Arizona doesn't observe DST
	CO: 'America/Denver',
	ID: 'America/Denver',
	MT: 'America/Denver',
	NM: 'America/Denver',
	UT: 'America/Denver',
	WY: 'America/Denver',

	// Central Time
	AL: 'America/Chicago',
	AR: 'America/Chicago',
	IL: 'America/Chicago',
	IA: 'America/Chicago',
	KS: 'America/Chicago',
	LA: 'America/Chicago',
	MN: 'America/Chicago',
	MS: 'America/Chicago',
	MO: 'America/Chicago',
	NE: 'America/Chicago',
	ND: 'America/Chicago',
	OK: 'America/Chicago',
	SD: 'America/Chicago',
	TN: 'America/Chicago',
	TX: 'America/Chicago',
	WI: 'America/Chicago',

	// Eastern Time
	CT: 'America/New_York',
	DE: 'America/New_York',
	FL: 'America/New_York',
	GA: 'America/New_York',
	IN: 'America/New_York',
	KY: 'America/New_York',
	ME: 'America/New_York',
	MD: 'America/New_York',
	MA: 'America/New_York',
	MI: 'America/New_York',
	NH: 'America/New_York',
	NJ: 'America/New_York',
	NY: 'America/New_York',
	NC: 'America/New_York',
	OH: 'America/New_York',
	PA: 'America/New_York',
	RI: 'America/New_York',
	SC: 'America/New_York',
	VT: 'America/New_York',
	VA: 'America/New_York',
	WV: 'America/New_York',

	// Alaska Time
	AK: 'America/Anchorage',

	// Hawaii-Aleutian Time
	HI: 'America/Adak'
};

// Fallback: Approximate timezone based on longitude
function getApproximateTimezone(lon: number): string {
	// US Pacific Time (West Coast: -125° to -114°)
	if (lon >= -125 && lon <= -114) {
		console.log(`Longitude ${lon} in Pacific range`);
		return 'America/Los_Angeles';
	}

	// US Mountain Time (-114° to -104°)
	if (lon >= -114 && lon <= -104) {
		console.log(`Longitude ${lon} in Mountain range`);
		return 'America/Denver';
	}

	// US Central Time (-104° to -87°)
	if (lon >= -104 && lon <= -87) {
		console.log(`Longitude ${lon} in Central range`);
		return 'America/Chicago';
	}

	// US Eastern Time (East Coast: -87° to -67°)
	if (lon >= -87 && lon <= -67) {
		console.log(`Longitude ${lon} in Eastern range`);
		return 'America/New_York';
	}

	// Alaska (west of -130°)
	if (lon <= -130) {
		console.log(`Longitude ${lon} in Alaska range`);
		return 'America/Anchorage';
	}

	// Hawaii (around -160° to -154°)
	if (lon >= -160 && lon <= -154) {
		console.log(`Longitude ${lon} in Hawaii range`);
		return 'America/Adak';
	}

	// International fallbacks
	if (lon >= -10 && lon <= 40) return 'Europe/London';
	if (lon >= 100 && lon <= 180) return 'Asia/Tokyo';

	// Default fallback
	console.warn(`⚠️ Longitude ${lon} outside all known ranges, defaulting to America/New_York`);
	return 'America/New_York';
}
