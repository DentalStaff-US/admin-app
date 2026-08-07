export type CalendarEvent = {
	start: Date;
	end: Date;
	title: string;
	resourceIds?: string[];
	resourceId?: string;
	id: string;
	extendedProps: Record<string, any>;
};

export type PaginateOptions = {
	limit: number;
	offset: number;
	orderBy?: { column: string; direction: string };
};

export interface AddressResult {
	place_name: string;
	formatted_address: string;
	coordinates: {
		lat: number;
		lng: number;
	};
	context?: {
		country?: string;
		region?: string;
		region_code?: string; // 2-letter state code
		district?: string;
		postcode?: string;
		place?: string; // City/town (Mapbox v6 primary city field)
		locality?: string; // Sub-city area; often absent
		neighborhood?: string;
		street?: string;
	};
	address_components?: {
		street_number?: string;
		street_name?: string;
		subpremise?: string; // Suite/apartment number
		premise?: string; // Building name
		secondary_address?: string; // Unit, suite, apt, etc.
		address_line1?: string;
		address_line2?: string;
	};
	place_id: string;
	place_type?: string[];
	raw_properties?: any; // For debugging - you can remove this in production
}
