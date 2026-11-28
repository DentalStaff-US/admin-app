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

const proDisciplines = [
	{
		discipline: { id: 'd1', name: 'Dental Hygienist', abbreviation: 'RDH', requiresLicense: true },
		experience: { experienceLevel: '5+ years', experienceLevelId: 'e3', requiresCert: false },
		salaryRange: { min: 42, max: 52 },
		effectiveLicenseExpiry: '2026-12-01',
		licenseGraceStartedOn: null,
		effectiveCertExpiry: null
	},
	{
		discipline: { id: 'd2', name: 'Dental Assistant', abbreviation: 'DA', requiresLicense: false },
		experience: { experienceLevel: '3–5 years', experienceLevelId: 'e2', requiresCert: true },
		salaryRange: { min: 26, max: 30 },
		effectiveLicenseExpiry: null,
		licenseGraceStartedOn: null,
		effectiveCertExpiry: '2028-03-31'
	}
];

const worked = (id: string, day: string, ts: { id: string; week: string; hours: string; status: string }, req = 1042, practice = 'Bright Smiles Dental') => ({
	workday: { id },
	recurrenceDay: { dayStart: d(`${day}T12:30:00Z`) },
	requisition: { id: req, title: 'Temp Dental Hygienist', companyName: practice },
	location: { address1: '1201 W Platt St', address2: null, city: 'Tampa', state: 'FL', zip: '33606' },
	timesheet: { id: ts.id, totalHoursWorked: ts.hours, status: ts.status, weekBeginDate: ts.week }
});
const t1 = { id: 'ts1', week: '2026-10-26', hours: '16.5', status: 'APPROVED' };
const t2 = { id: 'ts2', week: '2026-11-02', hours: '24', status: 'SUBMITTED' };

export function professionalData(opts: { admin?: boolean; empty?: boolean } = {}) {
	const admin = opts.admin ?? true;
	const empty = opts.empty ?? false;
	return {
		user: { id: 'me', role: admin ? 'SUPERADMIN' : 'CLIENT' },
		candidate: {
			user: { id: 'u-p1', firstName: 'Maria', lastName: 'Gonzalez', email: 'maria.gonzalez@example.com', avatarUrl: null, receiveEmail: true, receiveSms: false },
			profile: { id: 'p1', puid: 10482, status: 'ACTIVE', cellPhone: '8135550142', completeAddress: '1201 W Platt St, Tampa, FL 33606', birthday: '1991-04-18', workersCompCode: '8021', workPreference: null }
		},
		allDisciplines: empty ? [] : proDisciplines,
		availableDisciplines: Object.values(disciplines),
		experienceLevels: [
			{ id: 'e1', value: '0–2 years' },
			{ id: 'e2', value: '3–5 years' },
			{ id: 'e3', value: '5+ years' }
		],
		workHistory: empty ? [] : [worked('w1', '2026-10-27', t1), worked('w2', '2026-10-29', t1), worked('w3', '2026-11-03', t2), worked('w4', '2026-11-04', t2), worked('w5', '2026-11-05', t2)],
		documents: empty
			? []
			: [
					{ id: 'doc1', filename: 'FL-RDH-license.pdf', type: 'LICENSE', uploadUrl: '#', adminOnly: false, createdAt: d('2026-03-14'), expiryDate: '2026-12-01', disciplineId: 'd1', skillId: null },
					{ id: 'doc2', filename: 'DANB-cert.jpg', type: 'CERTIFICATE', uploadUrl: '#', adminOnly: false, createdAt: d('2026-04-02'), expiryDate: '2028-03-31', disciplineId: 'd2', skillId: null },
					{ id: 'doc3', filename: 'resume-2026.docx', type: 'RESUME', uploadUrl: '#', adminOnly: true, createdAt: d('2026-03-14'), expiryDate: null, disciplineId: null, skillId: null }
				],
		statusForm: fakeSuperValidated({ status: 'ACTIVE' }),
		personalDetailsForm: fakeSuperValidated({}),
		disciplinesForm: fakeSuperValidated({
			disciplines: proDisciplines.map((x) => ({ disciplineId: x.discipline.id, experienceLevelId: x.experience.experienceLevelId, preferredHourlyMin: x.salaryRange.min, preferredHourlyMax: x.salaryRange.max }))
		}),
		documentsForm: fakeSuperValidated({ urls: [], filesData: '' }),
		comments: empty ? [] : comments,
		activity: empty ? [] : activity,
		availability: {
			availableDays: [1, 2, 3, 4, 5],
			availableDaysSource: 'ADMIN',
			availableDaysUpdatedAt: d('2026-11-01'),
			blackouts: [{ date: '2026-11-26', source: 'PROFESSIONAL', note: 'Thanksgiving' }, { date: '2026-12-24', source: 'ADMIN', note: null }],
			bookedDates: [{ date: '2026-11-12', requisitionId: 1042, workdayId: 'w9' }]
		},
		availabilityWindow: { from: '2026-11-10', to: '2027-11-10' },
		candidateSkills: [{ skillId: 'sk1', name: 'Nitrous monitoring', categoryId: 'c1', categoryName: 'Clinical', requiresCertificate: true, certExpiresOn: null, effective: true }],
		skillCatalog: [{ id: 'c1', name: 'Clinical', description: null, skills: [{ id: 'sk1', name: 'Nitrous monitoring', requiresCertificate: true, archivedAt: null }, { id: 'sk2', name: 'Local anesthesia', requiresCertificate: true, archivedAt: null }] }]
	};
}

export function clientData(opts: { empty?: boolean; paper?: boolean } = {}) {
	const empty = opts.empty ?? false;
	const updateData = {
		firstName: 'Sandra', lastName: 'Keene', email: 'owner@brightsmiles.test', billingEmail: 'ap@brightsmiles.test',
		billingContactName: 'Accounts Payable', billingStreetOne: '1201 W Platt St', billingStreetTwo: 'Suite 200',
		billingCity: 'Tampa', billingState: 'FL', billingZipcode: '33606', companyName: 'Bright Smiles Dental',
		baseLocation: 'Tampa, FL', website: 'https://brightsmiles.test', cellPhone: '8135550100', invoiceMethod: opts.paper ? 'PAPER' : 'STRIPE'
	};
	return {
		user: { id: 'me', role: 'SUPERADMIN' },
		client: {
			profile: { id: 'c1', status: 'ACTIVE', cellPhone: '8135550100', clientInvoiceMethod: opts.paper ? 'PAPER' : 'STRIPE' },
			user: { id: 'u1', firstName: 'Sandra', lastName: 'Keene', email: 'owner@brightsmiles.test', avatarUrl: null, receiveEmail: false, receiveSms: true },
			company: { id: 'co1', companyName: 'Bright Smiles Dental', companyLogo: null, baseLocation: 'Tampa, FL', website: 'https://brightsmiles.test', billingEmail: 'ap@brightsmiles.test', billingContactName: 'Accounts Payable', billingStreetOne: '1201 W Platt St', billingStreetTwo: 'Suite 200', billingCity: 'Tampa', billingState: 'FL', billingZipcode: '33606' },
			locations: empty ? [] : locations.map((l) => ({ id: l.id, name: l.location_name, completeAddress: l.complete_address, companyPhone: l.company_phone })),
			subscription: { stripeCustomerId: 'cus_x', stripeCustomerSetupPending: false }
		},
		requisitions: empty ? [] : [
			{ id: 1042, disciplineName: 'Dental Hygienist', locationName: 'Tampa – Platt St', status: 'OPEN', permanentPosition: false, hourlyRate: 48 },
			{ id: 1031, disciplineName: 'Office Manager', locationName: 'Brandon', status: 'PAYMENT_REQUIRED', permanentPosition: true, hourlyRate: 0 },
			{ id: 1007, disciplineName: 'Dental Assistant', locationName: 'Wesley Chapel', status: 'FILLED', permanentPosition: false, hourlyRate: 29 }
		],
		recurrenceDays: [],
		supportTickets: empty ? [] : [{ id: 't1', title: 'Timesheet shows wrong lunch break', status: 'NEW', createdAt: d('2026-11-04') }],
		staff: empty ? [] : staff.map((s, i) => ({ ...s, primaryLocation: { name: locations[i % 3].location_name }, locationAssignments: [{ locationId: locations[i % 3].id, isPrimary: true }] })),
		pendingInvites: empty ? [] : pendingInvites,
		invoices: empty ? [] : [
			{ invoice: { id: 'inv1', invoiceNumber: 'DTSS-2026-0412', amountDue: '1248.00', total: '1248.00', status: 'open', dueDate: d('2026-11-20'), createdAt: d('2026-11-06') } },
			{ invoice: { id: 'inv2', invoiceNumber: 'DTSS-2026-0388', amountDue: '0', total: '2310.50', status: 'paid', dueDate: d('2026-10-30'), createdAt: d('2026-10-16') } }
		],
		invoiceForm: fakeSuperValidated({ amount: 0, dueDate: '', description: '', invoiceMethod: 'STRIPE', items: '[]' }),
		requisitionForm: fakeSuperValidated({}),
		locationForm: fakeSuperValidated({}),
		updateClientForm: fakeSuperValidated(updateData),
		statusForm: fakeSuperValidated({ status: 'ACTIVE' }),
		comments: empty ? [] : comments,
		activity: empty ? [] : [{ id: 'x1', createdAt: d('2026-11-08T13:00:00Z'), action: 'SIGN_IN', entityType: 'USERS', actorName: 'Sandra Keene', metadata: null }],
		documents: empty ? [] : [{ id: 'cd1', filename: 'Staffing-agreement-signed.pdf', type: 'AGREEMENT', adminOnly: false, createdAt: d('2026-01-10') }],
		signatureRequests: [],
		signatureKinds: [{ kind: 'CLIENT_AGREEMENT', title: 'staffing agreement' }],
		blacklistedCandidates: empty ? [] : [{ candidateId: 'p9', firstName: 'Kyle', lastName: 'Barnes', email: 'kyle.b@example.com', avatarUrl: null, createdAt: d('2026-06-02') }],
		billingMismatchMessage: opts.paper ? 'This practice invoices on paper but has a Stripe customer on file. Every invoice, approved timesheets included, bills as paper until this changes.' : null,
		permanentRequisitions: [{ id: 1031, title: 'Office Manager', status: 'PAYMENT_REQUIRED' }]
	};
}

const hours = Object.fromEntries(
	Array.from({ length: 7 }, (_, i) => [i, { openTime: '08:00', closeTime: '17:00', isClosed: i === 0 || i === 6, timezone: 'America/New_York' }])
);

export function locationData(opts: { noCoords?: boolean } = {}) {
	return {
		client: {
			profile: { id: 'c1' },
			user: { firstName: 'Sandra', lastName: 'Keene', email: 'owner@brightsmiles.test', avatarUrl: null },
			company: { companyName: 'Bright Smiles Dental', companyLogo: null, licenseNumber: 'FL-DEN-20419' }
		},
		location: {
			id: 'l1', name: 'Tampa – Platt St', completeAddress: '1201 W Platt St, Tampa, FL 33606', city: 'Tampa', state: 'FL',
			lat: opts.noCoords ? null : '27.9417', lon: opts.noCoords ? null : '-82.4746', timezone: 'America/New_York',
			companyPhone: '(813) 555-0100', cellPhone: '(813) 555-0144', email: 'platt@brightsmiles.test', website: 'https://brightsmiles.test',
			operatingHours: hours, createdAt: d('2025-11-03'), updatedAt: d('2026-10-30')
		},
		timezoneDrift: { requisitions: [{ id: 988, referenceTimezone: 'America/Chicago' }] },
		contactDestinations: [
			{ id: 'cd1', type: 'EMAIL', value: 'alerts@brightsmiles.test' },
			{ id: 'cd2', type: 'SMS', value: '(813) 555-0177' }
		],
		addressForm: fakeSuperValidated({ lat: '', lon: '', completeAddress: '' }),
		contactForm: fakeSuperValidated({ companyPhone: '(813) 555-0100', cellPhone: '', email: 'platt@brightsmiles.test', website: '' }),
		operatingHoursForm: fakeSuperValidated({ operatingHours: JSON.stringify(hours) }),
		locationForm: fakeSuperValidated({ timezone: 'America/New_York' }),
		destinationForm: fakeSuperValidated({ type: 'EMAIL', value: '' })
	};
}

export function practiceLocationData() {
	const base = locationData();
	return {
		user: { id: 'u1', role: 'CLIENT' },
		location: base.location,
		company: { id: 'co1', companyName: 'Bright Smiles Dental' },
		requisitions: [
			{ id: 1042, status: 'OPEN', title: 'Temp Dental Hygienist', experienceLevel: '3–5 years', discipline: 'Dental Hygienist' },
			{ id: 1007, status: 'FILLED', title: 'Temp Dental Assistant', experienceLevel: '0–2 years', discipline: 'Dental Assistant' }
		],
		locationStaff: staff.map((s, i) => ({ ...s, isPrimary: i === 0 })),
		allStaff: staff,
		assignForm: fakeSuperValidated({ companyId: 'co1', staffId: '', locationId: 'l1', isPrimary: false }),
		clientForm: fakeSuperValidated({}),
		locationForm: fakeSuperValidated({ timezone: 'America/New_York', companyPhone: '(813) 555-0100', cellPhone: '', email: '', website: '', lat: '', lon: '', completeAddress: '' }),
		operatingHoursForm: base.operatingHoursForm,
		pendingInvites: pendingInvites.slice(0, 1),
		canCreateRequisitions: true,
		clientStatus: 'ACTIVE'
	};
}
