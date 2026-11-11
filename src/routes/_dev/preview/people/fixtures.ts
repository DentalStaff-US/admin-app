// Fake data for /_dev/preview/people. Dev-only; never imported by real routes.
import type { ClientRow, ProfessionalRow, StaffRow } from '$features/people';

const d = (iso: string) => new Date(iso);

export function fakeSuperValidated<T extends Record<string, unknown>>(data: T, id = 'fixture') {
	return { id, valid: false, posted: false, errors: {}, data, constraints: {} } as any;
}

export const disciplines = {
	rdh: { id: 'd1', name: 'Dental Hygienist', abbreviation: 'RDH' },
	da: { id: 'd2', name: 'Dental Assistant', abbreviation: 'DA' },
	efda: { id: 'd3', name: 'Expanded Function DA', abbreviation: 'EFDA' },
	fo: { id: 'd4', name: 'Front Office', abbreviation: 'FO' }
};

export const professionals: ProfessionalRow[] = [
	{ user: { firstName: 'Maria', lastName: 'Gonzalez', email: 'maria.gonzalez@example.com', avatarUrl: null }, profile: { id: 'p1', cellPhone: '8135550142', completeAddress: '1201 W Platt St, Tampa, FL 33606', createdAt: d('2026-03-14') }, disciplines: [disciplines.rdh] },
	{ user: { firstName: 'Darnell', lastName: 'Brooks', email: 'dbrooks@example.com', avatarUrl: null }, profile: { id: 'p2', cellPhone: '7275550188', completeAddress: '410 Central Ave, St. Petersburg, FL 33701', createdAt: d('2026-05-02') }, disciplines: [disciplines.da, disciplines.efda, disciplines.fo] },
	{ user: { firstName: 'Priya', lastName: 'Natarajan', email: 'priya.n@example.com', avatarUrl: null }, profile: { id: 'p3', cellPhone: null, completeAddress: '88 Harbour Island Blvd, Tampa, FL 33602', createdAt: d('2026-08-21') }, disciplines: [disciplines.rdh, disciplines.da] },
	{ user: { firstName: 'Jake', lastName: 'Whitfield', email: 'jake.whitfield@example.com', avatarUrl: null }, profile: { id: 'p4', cellPhone: '8135550111', completeAddress: null, createdAt: d('2026-10-30') }, disciplines: [] }
];

export const proFacets = {
	disciplines: [
		{ value: 'd1', label: 'Dental Hygienist', count: 41 },
		{ value: 'd2', label: 'Dental Assistant', count: 63 },
		{ value: 'd4', label: 'Front Office', count: 18 }
	],
	cities: [
		{ value: 'Tampa', label: 'Tampa', count: 52 },
		{ value: 'St. Petersburg', label: 'St. Petersburg', count: 21 }
	],
	states: [{ value: 'FL', label: 'FL', count: 110 }],
	zipcodes: [{ value: '33606', label: '33606', count: 9 }]
};

export const clients: ClientRow[] = [
	{ user: { email: 'owner@brightsmiles.test', id: 'u1', firstName: 'Sandra', lastName: 'Keene', avatarUrl: null }, profile: { id: 'c1', userId: 'u1', createdAt: d('2025-11-03'), status: 'ACTIVE', cellPhone: '8135550100' }, company: { id: 'co1', companyName: 'Bright Smiles Dental', companyLogo: null }, locations: [{ city: 'Tampa', state: 'FL' } as any, { city: 'Brandon', state: 'FL' } as any, { city: 'Wesley Chapel', state: 'FL' } as any] },
	{ user: { email: 'frontdesk@oakstreet.test', id: 'u2', firstName: 'Tom', lastName: 'Alvarez', avatarUrl: null }, profile: { id: 'c2', userId: 'u2', createdAt: d('2026-02-11'), status: 'ACTIVE', cellPhone: null }, company: { id: 'co2', companyName: 'Oak Street Family Dentistry', companyLogo: null }, locations: [{ city: 'Clearwater', state: 'FL' } as any] },
	{ user: { email: 'admin@harbordental.test', id: 'u3', firstName: 'Lena', lastName: 'Park', avatarUrl: null }, profile: { id: 'c3', userId: 'u3', createdAt: d('2026-09-28'), status: 'ACTIVE', cellPhone: null }, company: { id: 'co3', companyName: 'Harbor Dental Group', companyLogo: null }, locations: [] }
];

export const staff: StaffRow[] = [
	{ profile: { id: 's1', createdAt: d('2026-01-09'), birthday: null, staffRole: 'CLIENT_ADMIN' }, user: { id: 'su1', firstName: 'Renee', lastName: 'Okafor', email: 'renee@brightsmiles.test', avatarUrl: null } },
	{ profile: { id: 's2', createdAt: d('2026-04-17'), birthday: '1990-06-02', staffRole: 'CLIENT_MANAGER' }, user: { id: 'su2', firstName: 'Mark', lastName: 'Ellison', email: 'mark@brightsmiles.test', avatarUrl: null } },
	{ profile: { id: 's3', createdAt: d('2026-07-30'), birthday: null, staffRole: 'CLIENT_EMPLOYEE' }, user: { id: 'su3', firstName: 'Jasmine', lastName: 'Cole', email: 'jasmine@brightsmiles.test', avatarUrl: null } }
];

export const pendingInvites = [
	{ id: 'i1', email: 'newhire@brightsmiles.test', staffRole: 'CLIENT_EMPLOYEE', invitedRole: 'CLIENT_STAFF', createdAt: d('2026-11-08'), expiresAt: d('2026-11-15'), locationName: 'Tampa – Platt St' },
	{ id: 'i2', email: 'old@brightsmiles.test', staffRole: 'CLIENT_MANAGER', invitedRole: 'CLIENT_STAFF', createdAt: d('2026-10-01'), expiresAt: d('2026-10-08'), locationName: 'Brandon' }
];

export const comments = [
	{ id: 'n1', body: 'Prefers morning shifts. Has her own loupes.', createdAt: d('2026-11-02T14:20:00Z'), authorId: 'me', authorFirstName: 'Shannon', authorLastName: 'Carter', authorAvatarUrl: null },
	{ id: 'n2', body: 'Called about license renewal — sending the new card this week.', createdAt: d('2026-10-20T09:05:00Z'), authorId: 'other', authorFirstName: 'Luis', authorLastName: 'Ramos', authorAvatarUrl: null }
];

export const activity = [
	{ id: 'a1', createdAt: d('2026-11-09T15:02:00Z'), action: 'UPDATE', entityType: 'CANDIDATES', actorName: 'Shannon Carter', metadata: { field: 'disciplines' } },
	{ id: 'a2', createdAt: d('2026-11-01T11:40:00Z'), action: 'STATUS_CHANGE', entityType: 'CANDIDATES', actorName: 'Shannon Carter', metadata: null },
	{ id: 'a3', createdAt: d('2026-10-28T08:12:00Z'), action: 'REMIND', entityType: 'CANDIDATES', actorName: null, metadata: null }
];

export const locations = [
	{ id: 'l1', location_name: 'Tampa – Platt St', complete_address: '1201 W Platt St, Tampa, FL 33606', company_phone: '(813) 555-0100' },
	{ id: 'l2', location_name: 'Brandon', complete_address: '980 W Brandon Blvd, Brandon, FL 33511', company_phone: '(813) 555-0190' },
	{ id: 'l3', location_name: 'Wesley Chapel', complete_address: '2700 Bruce B Downs Blvd, Wesley Chapel, FL 33544', company_phone: null }
];
