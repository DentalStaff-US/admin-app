// Fake data for /_dev/preview/settings. Nothing here touches a database.

let n = 0;
/** A superforms v1 SuperValidated look-alike: enough for superForm() to start. */
export function fakeForm<T extends Record<string, unknown>>(data: T) {
	n += 1;
	return { id: `preview-form-${n}`, valid: false, posted: false, errors: {}, data, constraints: {}, message: undefined };
}

const hours = JSON.stringify({
	0: { openTime: 'T00:00:00.000Z', closeTime: 'T00:00:00.000Z', isClosed: true, timezone: 'America/New_York' },
	1: { openTime: '08:00:00-05', closeTime: '17:00:00-05', isClosed: false, timezone: 'America/New_York' },
	2: { openTime: '08:00:00-05', closeTime: '17:00:00-05', isClosed: false, timezone: 'America/New_York' },
	3: { openTime: '08:00:00-05', closeTime: '17:00:00-05', isClosed: false, timezone: 'America/New_York' },
	4: { openTime: '08:00:00-05', closeTime: '19:00:00-05', isClosed: false, timezone: 'America/New_York' },
	5: { openTime: '08:00', closeTime: '14:00', isClosed: false, timezone: 'America/New_York' },
	6: { openTime: 'T00:00:00.000Z', closeTime: 'T00:00:00.000Z', isClosed: true, timezone: 'America/New_York' }
});

export const user = {
	id: 'u1',
	firstName: 'Shannon',
	lastName: 'Carter',
	email: 'shannon@brightsmiles.test',
	avatarUrl: null,
	twoFactorEnabled: false
};

export const company = {
	id: 'c1',
	companyName: 'Bright Smiles Dental',
	companyLogo: null,
	companyDescription: 'A family practice in South Tampa with four operatories and a friendly front desk.',
	baseLocation: 'Tampa, FL',
	website: 'https://brightsmiles.test',
	operatingHours: hours
};

export const forms = () => ({
	userProfileForm: fakeForm({ firstName: user.firstName, lastName: user.lastName, email: user.email }),
	profileForm: fakeForm({ cell_phone: '8135550142' }),
	passwordForm: fakeForm({ password: '', newPassword: '', confirmPassword: '' }),
	companyForm: fakeForm({
		companyName: company.companyName,
		companyDescription: company.companyDescription,
		companyLogo: '',
		baseLocation: company.baseLocation,
		website: company.website,
		operatingHours: hours
	}),
	billingContactForm: fakeForm({
		billingEmail: 'ap@brightsmiles.test',
		billingContactName: 'Accounts payable',
		billingStreetOne: '2101 S Dale Mabry Hwy',
		billingStreetTwo: 'Suite 4',
		billingCity: 'Tampa',
		billingState: 'FL',
		billingZipcode: '33629'
	}),
	inviteForm: fakeForm({ invitees: [] as { email: string; staffRole: string }[] })
});

const daysAgo = (d: number) => new Date(Date.now() - d * 864e5);

export const staff = [
	{ profile: { id: 's1', staffRole: 'CLIENT_ADMIN', createdAt: daysAgo(400), birthday: null }, user: { firstName: 'Maria', lastName: 'Lopez', email: 'maria@brightsmiles.test', avatarUrl: null }, locationAssignments: [{ locationId: 'l1', isPrimary: true, locationName: 'South Tampa' }] },
	{ profile: { id: 's2', staffRole: 'CLIENT_MANAGER', createdAt: daysAgo(120), birthday: '1990-04-12' }, user: { firstName: 'Devon', lastName: 'Price', email: 'devon@brightsmiles.test', avatarUrl: null }, locationAssignments: [{ locationId: 'l1', isPrimary: true, locationName: 'South Tampa' }, { locationId: 'l2', isPrimary: false, locationName: 'Westchase' }] },
	{ profile: { id: 's3', staffRole: 'CLIENT_EMPLOYEE', createdAt: daysAgo(30), birthday: null }, user: { firstName: 'Aisha', lastName: 'Khan', email: 'aisha.khan@brightsmiles.test', avatarUrl: null }, locationAssignments: [] }
] as const;

export const pendingInvites = [
	{ id: 'i1', email: 'frontdesk@brightsmiles.test', staffRole: 'CLIENT_EMPLOYEE', invitedRole: 'CLIENT_STAFF', createdAt: daysAgo(2), expiresAt: daysAgo(-5), locationName: 'South Tampa' },
	{ id: 'i2', email: 'old.hire@brightsmiles.test', staffRole: 'CLIENT_MANAGER', invitedRole: 'CLIENT_STAFF', createdAt: daysAgo(12), expiresAt: daysAgo(5), locationName: 'Westchase' }
];

export const locations = [
	{ id: 'l1', name: 'South Tampa' },
	{ id: 'l2', name: 'Westchase' }
];

export const documents = [
	{ id: 'd1', filename: 'Service agreement 2026.pdf', type: 'AGREEMENT', createdAt: daysAgo(60), adminOnly: true },
	{ id: 'd2', filename: 'Business license.pdf', type: 'LICENSE', createdAt: daysAgo(20), adminOnly: false },
	{ id: 'd3', filename: 'Office floor plan.png', type: 'OTHER', createdAt: daysAgo(3), adminOnly: false }
];

export const billing = {
	setup: { clientSubscription: null, paymentMethod: null, subscription: null, invoices: [] },
	card: {
		clientSubscription: { stripeCustomerId: 'cus_123', stripeCustomerSetupPending: false },
		paymentMethod: { type: 'card', brand: 'visa', last4: '4242', expiryMonth: 8, expiryYear: 2028 },
		subscription: null,
		invoices: [
			{ id: 'in_1', date: daysAgo(10), amount: '1,248.00', status: 'paid', pdfUrl: '#' },
			{ id: 'in_2', date: daysAgo(40), amount: '980.50', status: 'open', pdfUrl: '#' }
		]
	}
};

export const affiliateStatus = { programEnabled: true, eligible: true, enrolled: false };
