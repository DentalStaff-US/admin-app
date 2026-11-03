import { describe, it, expect, vi, afterEach } from 'vitest';
import { addressQueryVariants, featureMatches, geocodeAddressWithToken } from './mapbox-core';

describe('addressQueryVariants', () => {
	it('adds a fallback with the leading directional stripped', () => {
		expect(addressQueryVariants('721 S Maple St, La Conner, WA, 98257')).toEqual([
			'721 S Maple St, La Conner, WA, 98257',
			'721 Maple St, La Conner, WA, 98257'
		]);
	});

	it('strips trailing directionals too', () => {
		expect(addressQueryVariants('100 Main St NW, Atlanta, GA 30303')[1]).toBe(
			'100 Main St, Atlanta, GA 30303'
		);
	});

	it('leaves a directional that is the street name alone', () => {
		expect(addressQueryVariants('1200 N St NW, Washington, DC 20005')[1]).toBe(
			'1200 N St, Washington, DC 20005'
		);
	});

	it('does not touch spelled-out names or addresses without a directional', () => {
		expect(addressQueryVariants('123 West End Ave, New York, NY 10023')).toHaveLength(1);
		expect(addressQueryVariants('721 Maple Ave, La Conner, WA 98257')).toHaveLength(1);
	});
});

describe('featureMatches', () => {
	const expected = { street: '721 S Maple Ave', city: 'La Conner', state: 'WA', zipcode: '98257' };

	it('rejects a result in another state', () => {
		expect(
			featureMatches(
				{ street: '721 Maple Avenue', city: 'Los Angeles', state: 'CA', zipcode: '90014' },
				expected
			)
		).toBe(false);
	});

	it('rejects a same-state result with a different city and zip', () => {
		expect(
			featureMatches(
				{ street: '721 Maple Ave', city: 'Seattle', state: 'WA', zipcode: '98101' },
				expected
			)
		).toBe(false);
	});

	it('accepts when state and either zip or city match', () => {
		expect(
			featureMatches({ street: null, city: 'La Conner', state: 'WA', zipcode: '98273' }, expected)
		).toBe(true);
		expect(
			featureMatches(
				{ street: null, city: 'Skagit County', state: 'WA', zipcode: '98257' },
				expected
			)
		).toBe(true);
	});

	it('accepts anything when the input could not be parsed', () => {
		expect(featureMatches({ street: null, city: 'X', state: 'CA', zipcode: null }, null)).toBe(
			true
		);
	});
});

function feature(
	fullAddress: string,
	regionCode: string,
	city: string,
	zip: string,
	lon: number,
	lat: number
) {
	return {
		type: 'Feature',
		geometry: { type: 'Point', coordinates: [lon, lat] },
		properties: {
			mapbox_id: fullAddress,
			feature_type: 'address',
			full_address: fullAddress,
			postcode: zip,
			context: { region: { name: regionCode, region_code: regionCode }, place: { name: city } }
		}
	};
}

describe('geocodeAddressWithToken', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('skips an out-of-state result and falls back to the stripped query', async () => {
		const laConner = feature(
			'721 Maple Avenue, La Conner, Washington 98257, United States',
			'WA',
			'La Conner',
			'98257',
			-122.49,
			48.39
		);
		const losAngeles = feature(
			'721 Maple Avenue, Los Angeles, California 90014, United States',
			'CA',
			'Los Angeles',
			'90014',
			-118.25,
			34.04
		);

		const fetchMock = vi.fn(async (url: string) => {
			const q = new URL(url).searchParams.get('q');
			const features = q?.includes(' S ') ? [losAngeles] : [laConner];
			return new Response(JSON.stringify({ type: 'FeatureCollection', features, attribution: '' }));
		});
		vi.stubGlobal('fetch', fetchMock);
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.spyOn(console, 'log').mockImplementation(() => {});

		const result = await geocodeAddressWithToken('721 S Maple Ave, La Conner, WA 98257', 'token');

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(result?.components.city).toBe('La Conner');
		expect(result?.timezone).toBe('America/Los_Angeles');
	});

	it('returns null rather than a wrong-state match', async () => {
		const losAngeles = feature(
			'721 Maple Avenue, Los Angeles, California 90014, United States',
			'CA',
			'Los Angeles',
			'90014',
			-118.25,
			34.04
		);
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({ type: 'FeatureCollection', features: [losAngeles], attribution: '' })
					)
			)
		);
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.spyOn(console, 'error').mockImplementation(() => {});

		expect(await geocodeAddressWithToken('721 Maple Ave, La Conner, WA 98257', 'token')).toBeNull();
	});
});
