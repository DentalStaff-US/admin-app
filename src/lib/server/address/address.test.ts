import { describe, it, expect } from 'vitest';
import {
	normalizeState,
	normalizeZip,
	parseCompleteAddress,
	composeCompleteAddress,
	resolveAddressComponents
} from './index';

describe('normalizeState', () => {
	it('maps full names, abbreviations and mixed case to a 2-letter code', () => {
		expect(normalizeState('Texas')).toBe('TX');
		expect(normalizeState('texas')).toBe('TX');
		expect(normalizeState('tx')).toBe('TX');
		expect(normalizeState('TX')).toBe('TX');
		expect(normalizeState('  New   York ')).toBe('NY');
	});

	it('covers DC and territories that STATES omits', () => {
		expect(normalizeState('District of Columbia')).toBe('DC');
		expect(normalizeState('Puerto Rico')).toBe('PR');
	});

	it('returns null rather than guessing', () => {
		expect(normalizeState('Ontario')).toBeNull();
		expect(normalizeState('')).toBeNull();
		expect(normalizeState(null)).toBeNull();
	});
});

describe('normalizeZip', () => {
	it('reduces zip+4 to the 5-digit base', () => {
		expect(normalizeZip('78701-1234')).toBe('78701');
		expect(normalizeZip('78701')).toBe('78701');
	});

	it('returns null for non-zips', () => {
		expect(normalizeZip('ABC')).toBeNull();
		expect(normalizeZip(null)).toBeNull();
	});
});

describe('parseCompleteAddress', () => {
	it('parses the Mapbox full_address shape', () => {
		expect(parseCompleteAddress('123 Main St, Austin, Texas 78701, United States')).toEqual({
			street: '123 Main St',
			city: 'Austin',
			state: 'TX',
			zipcode: '78701'
		});
	});

	it('parses the DC case where city and state names differ', () => {
		expect(
			parseCompleteAddress(
				'1600 Pennsylvania Avenue Northwest, Washington, District of Columbia 20500, United States'
			)
		).toEqual({
			street: '1600 Pennsylvania Avenue Northwest',
			city: 'Washington',
			state: 'DC',
			zipcode: '20500'
		});
	});

	it('parses the CSV-composed shape where state and zip are separate segments', () => {
		expect(parseCompleteAddress('123 Main St, Apt 2, Austin, TX, 78701')).toEqual({
			street: '123 Main St, Apt 2',
			city: 'Austin',
			state: 'TX',
			zipcode: '78701'
		});
	});

	it('handles a missing street', () => {
		expect(parseCompleteAddress('Austin, TX 78701')).toEqual({
			street: null,
			city: 'Austin',
			state: 'TX',
			zipcode: '78701'
		});
	});

	it('handles a missing zip', () => {
		expect(parseCompleteAddress('123 Main St, Austin, Texas')).toEqual({
			street: '123 Main St',
			city: 'Austin',
			state: 'TX',
			zipcode: null
		});
	});

	it('tolerates zip+4 and USA variants', () => {
		expect(parseCompleteAddress('123 Main St, Austin, TX 78701-1234, USA')).toEqual({
			street: '123 Main St',
			city: 'Austin',
			state: 'TX',
			zipcode: '78701'
		});
	});

	it('returns null instead of guessing when city or state is unresolvable', () => {
		expect(parseCompleteAddress('Texas')).toBeNull();
		expect(parseCompleteAddress('123 Main St')).toBeNull();
		expect(parseCompleteAddress('123 Rue Principale, Montreal, Quebec H2X 1Y4')).toBeNull();
		expect(parseCompleteAddress('')).toBeNull();
		expect(parseCompleteAddress(null)).toBeNull();
	});
});

describe('composeCompleteAddress', () => {
	it('joins present parts and drops blanks', () => {
		expect(
			composeCompleteAddress({
				street: '123 Main St',
				city: 'Austin',
				state: 'TX',
				zipcode: '78701'
			})
		).toBe('123 Main St, Austin, TX, 78701');
		expect(composeCompleteAddress({ city: 'Austin', state: 'TX' })).toBe('Austin, TX');
		expect(composeCompleteAddress({})).toBeNull();
	});
});

describe('resolveAddressComponents', () => {
	it('prefers supplied components over the parsed string', () => {
		const result = resolveAddressComponents({
			completeAddress: '123 Main St, Austin, Texas 78701, United States',
			components: { city: 'Round Rock', state: 'texas', zipcode: '78664-0001' }
		});
		expect(result).toEqual({
			street: '123 Main St',
			city: 'Round Rock',
			state: 'TX',
			zipcode: '78664',
			needsGeocode: false
		});
	});

	it('fills gaps from the complete address', () => {
		const result = resolveAddressComponents({
			completeAddress: '123 Main St, Austin, Texas 78701, United States',
			components: null
		});
		expect(result.city).toBe('Austin');
		expect(result.state).toBe('TX');
		expect(result.needsGeocode).toBe(false);
	});

	it('flags a geocode when the address cannot be fully resolved', () => {
		const result = resolveAddressComponents({ completeAddress: 'Somewhere odd' });
		expect(result.needsGeocode).toBe(true);
		expect(result.city).toBeNull();
	});

	it('does not ask for a geocode when there is no address at all', () => {
		expect(resolveAddressComponents({ completeAddress: null }).needsGeocode).toBe(false);
	});
});
