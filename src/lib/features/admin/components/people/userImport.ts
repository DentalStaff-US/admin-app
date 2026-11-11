/**
 * CSV → user rows for the admin user import (moved out of the route so it can
 * be tested). Behaviour is unchanged: the same column aliases, address
 * assembly and validation the page always used.
 */

export type ImportRole = 'SUPERADMIN' | 'CLIENT' | 'CANDIDATE';

export interface ParsedUser {
	firstName: string;
	lastName: string;
	email: string;
	companyName?: string;
	companyLogo?: string;
	baseLocation?: string;
	cellPhone?: string;
	companyPhone?: string;
	birthday?: string;
	address?: string;
	addressTwo?: string;
	city?: string;
	state?: string;
	zipcode?: string;
	errors: string[];
	discipline?: string;
}

type CsvRow = Record<string, unknown>;

export const IMPORT_ROLE_LABELS: Record<ImportRole, string> = {
	SUPERADMIN: 'Super admin',
	CLIENT: 'Business',
	CANDIDATE: 'Professional'
};

/** The columns each role's CSV must have, for the helper text. */
export const REQUIRED_COLUMNS: Record<ImportRole, string> = {
	SUPERADMIN: 'First Name, Last Name, Email',
	CLIENT: 'First Name, Last Name, Email, Company Name, Address (Street 1), Address (Street 2), City, State, Zip Code',
	CANDIDATE: 'First Name, Last Name, Email, Address (Street 1), Address (Street 2), City, State, Zip Code, Discipline'
};

const columnMappings: Record<string, string[]> = {
	firstName: ['first name', 'firstname', 'first_name', 'first'],
	lastName: ['last name', 'lastname', 'last_name', 'last'],
	email: ['email', 'email address', 'e-mail'],
	birthday: ['birthday', 'birth date', 'date of birth', 'dob'],
	discipline: ['discipline', 'field', 'specialty'],
	companyName: ['company name', 'companyname', 'company_name', 'company', 'business name'],
	companyLogo: ['company logo', 'companylogo', 'company_logo', 'logo', 'logo url'],
	baseLocation: ['base location', 'baselocation', 'base_location', 'location', 'city'],
	companyPhone: ['company phone', 'companyphone', 'company_phone', 'phone', 'phone number'],
	cellPhone: ['cell phone', 'cellphone', 'cell_phone', 'mobile', 'mobile phone']
};

const addressComponentMappings: Record<string, string[]> = {
	streetOne: ['address (street 1)', 'address', 'street address', 'street 1', 'address1'],
	streetTwo: ['address (street 2)', 'address 2', 'street 2', 'address2', 'suite', 'apt'],
	city: ['city', 'town'],
	state: ['state', 'province', 'region'],
	zipcode: ['zip code', 'zipcode', 'zip', 'postal code', 'postalcode']
};

export function findColumnValue(row: CsvRow, field: string): string {
	if (row[field] !== undefined) return String(row[field]);
	for (const variation of columnMappings[field] ?? []) {
		const key = Object.keys(row).find((k) => k.toLowerCase() === variation.toLowerCase());
		if (key && row[key] !== undefined) return String(row[key]);
	}
	return '';
}

function findAddressComponent(row: CsvRow, component: string): string {
	for (const variation of addressComponentMappings[component] ?? []) {
		const key = Object.keys(row).find((k) => k.toLowerCase() === variation.toLowerCase());
		if (key && row[key] !== undefined && row[key] !== null) return String(row[key]).trim();
	}
	return '';
}

export function buildCompleteAddress(row: CsvRow) {
	const streetOne = findAddressComponent(row, 'streetOne');
	const streetTwo = findAddressComponent(row, 'streetTwo');
	const city = findAddressComponent(row, 'city');
	const state = findAddressComponent(row, 'state');
	const zipcode = findAddressComponent(row, 'zipcode');

	const parts: string[] = [];
	if (streetOne) parts.push(streetOne);
	if (streetTwo) parts.push(streetTwo);
	if (city && state) parts.push(`${city}, ${state}`);
	else if (city) parts.push(city);
	else if (state) parts.push(state);
	if (zipcode) parts.push(zipcode);

	return { streetOne, streetTwo, city, state, zipcode, fullAddress: parts.join(', ') };
}

export function validateUser(user: ParsedUser, role: ImportRole): string[] {
	const errors: string[] = [];
	if (!user.firstName?.trim()) errors.push('First name is required');
	if (!user.lastName?.trim()) errors.push('Last name is required');
	if (!user.email?.trim()) errors.push('Email is required');
	else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)) errors.push('Invalid email format');
	// Address is optional for practices (recommended for geocoding) and professionals.
	if (role === 'CLIENT' && !user.companyName?.trim()) errors.push('Company name is required');
	return errors;
}

/** One parsed CSV row → a user for the chosen role, with its validation errors. */
export function parseImportRow(row: CsvRow, role: ImportRole): ParsedUser {
	const user: ParsedUser = {
		firstName: findColumnValue(row, 'firstName').trim(),
		lastName: findColumnValue(row, 'lastName').trim(),
		email: findColumnValue(row, 'email').trim().toLowerCase(),
		errors: []
	};

	if (role === 'CLIENT') {
		user.companyName = findColumnValue(row, 'companyName').trim();
		user.companyLogo = findColumnValue(row, 'companyLogo').trim();
		user.baseLocation = findColumnValue(row, 'baseLocation').trim();
		user.birthday = findColumnValue(row, 'birthday').trim();
		user.companyPhone = findColumnValue(row, 'companyPhone').trim();
		user.cellPhone = findColumnValue(row, 'cellPhone').trim();
		const address = buildCompleteAddress(row);
		user.address = address.fullAddress; // the complete, geocodable address
		user.addressTwo = address.streetTwo;
		user.city = address.city;
		user.state = address.state;
		user.zipcode = address.zipcode;
	}

	if (role === 'CANDIDATE') {
		const address = buildCompleteAddress(row);
		user.address = address.fullAddress;
		user.city = address.city;
		user.state = address.state;
		user.zipcode = address.zipcode;
		user.discipline = findColumnValue(row, 'discipline').trim();
		user.birthday = findColumnValue(row, 'birthday').trim();
		user.cellPhone = findColumnValue(row, 'cellPhone').trim();
	}

	user.errors = validateUser(user, role);
	return user;
}
