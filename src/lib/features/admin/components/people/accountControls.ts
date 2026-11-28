/**
 * Rules for the account controls on the admin user page: which role switches
 * exist, what blocks a switch or a hard delete, and how the related records are
 * described. Pure and client-safe: the page renders from these and the server
 * (src/lib/server/accounts) decides with the same functions.
 */

/** Practice owner ↔ professional. Staff and admins are managed elsewhere. */
export const ROLE_SWITCHES = { CLIENT: 'CANDIDATE', CANDIDATE: 'CLIENT' } as const;
export type SwitchableRole = keyof typeof ROLE_SWITCHES;

export function roleSwitchTarget(role: string | null | undefined): SwitchableRole | null {
	return role === 'CLIENT' || role === 'CANDIDATE' ? ROLE_SWITCHES[role] : null;
}

/** Every count is for this one user, through whichever profiles they have. */
export type AccountRecordCounts = {
	// Records of business. The books keep these, so they block a switch or delete.
	requisitions: number;
	invoices: number;
	clientTimesheets: number;
	workdays: number;
	candidateTimesheets: number;
	applications: number;
	payouts: number;
	commissions: number;
	// Other people's accounts hanging off this practice.
	staffMembers: number;
	// Removed along with the profile.
	companies: number;
	locations: number;
	clientDocuments: number;
	candidateDocuments: number;
	signatureRequests: number;
	conversations: number;
	messagesSent: number;
	activeSessions: number;
};

/** Everything the admin user page shows, built by getAccountOverview. */
export type AccountOverview = {
	account: {
		id: string;
		email: string;
		firstName: string | null;
		lastName: string | null;
		role: string;
		verified: boolean;
		createdAt: Date | string;
		updatedAt: Date | string;
		completedOnboarding: boolean | null;
		onboardingStep: number | null;
		banned: boolean | null;
		banReason: string | null;
		banExpires: Date | string | null;
		twoFactorEnabled: boolean | null;
		receiveEmail: boolean;
		receiveSms: boolean;
		timezone: string | null;
		hasBillingCustomer: boolean;
	};
	/** Better Auth account providers, e.g. 'credential', 'google'. */
	signInMethods: string[];
	lastActiveAt: Date | string | null;
	practice: {
		profileId: string;
		status: string;
		cellPhone: string | null;
		companies: { id: string; name: string | null }[];
	} | null;
	professional: {
		profileId: string;
		puid: number;
		status: string | null;
		approved: boolean | null;
		city: string | null;
		state: string | null;
		cellPhone: string | null;
	} | null;
	/** CLIENT_STAFF: the practice they belong to. */
	staffOf: { clientProfileId: string; companyName: string | null; staffRole: string | null } | null;
	partner: { id: string; pid: number; status: string } | null;
	counts: AccountRecordCounts;
};

export const SIGN_IN_METHOD_LABELS: Record<string, string> = {
	credential: 'Password',
	google: 'Google',
	apple: 'Apple'
};

export function signInMethodsLabel(methods: string[]): string {
	if (methods.length === 0) return 'None (email code only)';
	return methods.map((m) => SIGN_IN_METHOD_LABELS[m] ?? m).join(', ');
}

export const EMPTY_COUNTS: AccountRecordCounts = {
	requisitions: 0,
	invoices: 0,
	clientTimesheets: 0,
	workdays: 0,
	candidateTimesheets: 0,
	applications: 0,
	payouts: 0,
	commissions: 0,
	staffMembers: 0,
	companies: 0,
	locations: 0,
	clientDocuments: 0,
	candidateDocuments: 0,
	signatureRequests: 0,
	conversations: 0,
	messagesSent: 0,
	activeSessions: 0
};

export function countLabel(n: number, one: string, many = `${one}s`): string {
	return `${n} ${n === 1 ? one : many}`;
}

function present(entries: [number, string, string?][]): string[] {
	return entries.filter(([n]) => n > 0).map(([n, one, many]) => countLabel(n, one, many));
}

/** Business records on the practice side (mirrors findUsersWithBusinessRecords). */
export function practiceRecords(c: AccountRecordCounts): string[] {
	return present([
		[c.requisitions, 'requisition'],
		[c.invoices, 'invoice'],
		[c.clientTimesheets, 'timesheet']
	]);
}

/** Business records on the professional side (mirrors findUsersWithBusinessRecords). */
export function professionalRecords(c: AccountRecordCounts): string[] {
	return present([
		[c.workdays, 'shift'],
		[c.candidateTimesheets, 'timesheet'],
		[c.applications, 'application']
	]);
}

export function affiliateRecords(c: AccountRecordCounts): string[] {
	return present([
		[c.payouts, 'partner payout'],
		[c.commissions, 'partner commission']
	]);
}

/**
 * Why the role can't switch, or [] when it can. Only the profile being removed
 * counts: a partner (affiliate) profile is role-independent and stays.
 */
export function roleSwitchBlockers(role: string | null | undefined, c: AccountRecordCounts): string[] {
	if (role === 'CLIENT') {
		return [
			...practiceRecords(c),
			// Their staff would be left with no practice.
			...present([[c.staffMembers, 'staff account']])
		];
	}
	if (role === 'CANDIDATE') return professionalRecords(c);
	return ['Only practice owners and professionals can switch roles.'];
}

/** Why the account can't be hard-deleted, or [] when it can. Anonymize instead. */
export function deleteBlockers(c: AccountRecordCounts): string[] {
	return [...practiceRecords(c), ...professionalRecords(c), ...affiliateRecords(c)];
}

/** What a switch away from `role` removes, for the confirmation copy. */
export function switchRemovals(role: string | null | undefined, c: AccountRecordCounts): string[] {
	const profile = role === 'CLIENT' ? 'practice profile' : 'professional profile';
	return [
		`their ${profile}`,
		...present(
			role === 'CLIENT'
				? [
						[c.companies, 'practice'],
						[c.locations, 'location'],
						[c.clientDocuments, 'document'],
						[c.signatureRequests, 'signature request']
					]
				: [[c.candidateDocuments, 'document']]
		),
		...present([[c.conversations, 'conversation']])
	];
}

/** Address on an anonymized account. Reserved TLD, so nothing is ever delivered. */
export const ANONYMIZED_EMAIL_DOMAIN = 'deleted.invalid';

export function isAnonymized(email: string | null | undefined): boolean {
	return !!email && email.endsWith(`@${ANONYMIZED_EMAIL_DOMAIN}`);
}

export function anonymizedEmail(userId: string): string {
	return `deleted-${userId}@${ANONYMIZED_EMAIL_DOMAIN}`;
}

/** Professional documents kept when anonymizing: signed agreements are contracts. */
export const KEPT_DOCUMENT_TYPES = ['AGREEMENT'] as const;
