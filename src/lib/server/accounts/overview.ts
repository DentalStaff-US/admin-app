/** The admin user page's read side: one user, every profile, every count. */
import { asc, eq, max } from 'drizzle-orm';
import db from '$lib/server/database/drizzle';
import { accountTable, sessionTable, userTable } from '$lib/server/database/schemas/auth';
import { candidateProfileTable } from '$lib/server/database/schemas/candidate';
import {
	clientCompanyTable,
	clientProfileTable,
	clientStaffProfileTable
} from '$lib/server/database/schemas/client';
import { affiliateProfileTable } from '$lib/server/database/schemas/affiliate';
import type { AccountOverview } from '$features/admin/components/people/accountControls';
import { countAccountRecords } from './records';

export async function getAccountOverview(userId: string): Promise<AccountOverview | null> {
	const [user] = await db.select().from(userTable).where(eq(userTable.id, userId));
	if (!user) return null;

	const [methods, [sessions], [practice], [professional], [staffOf], [partner], counts] = await Promise.all([
		db.selectDistinct({ providerId: accountTable.providerId }).from(accountTable).where(eq(accountTable.userId, userId)),
		db.select({ lastActiveAt: max(sessionTable.updatedAt) }).from(sessionTable).where(eq(sessionTable.userId, userId)),
		db
			.select({ profileId: clientProfileTable.id, status: clientProfileTable.status, cellPhone: clientProfileTable.cellPhone })
			.from(clientProfileTable)
			.where(eq(clientProfileTable.userId, userId))
			.orderBy(asc(clientProfileTable.createdAt))
			.limit(1),
		db
			.select({
				profileId: candidateProfileTable.id,
				puid: candidateProfileTable.puid,
				status: candidateProfileTable.status,
				approved: candidateProfileTable.approved,
				city: candidateProfileTable.city,
				state: candidateProfileTable.state,
				cellPhone: candidateProfileTable.cellPhone
			})
			.from(candidateProfileTable)
			.where(eq(candidateProfileTable.userId, userId))
			.limit(1),
		db
			.select({
				clientProfileId: clientStaffProfileTable.clientId,
				companyName: clientCompanyTable.companyName,
				staffRole: clientStaffProfileTable.staffRole
			})
			.from(clientStaffProfileTable)
			.innerJoin(clientCompanyTable, eq(clientCompanyTable.id, clientStaffProfileTable.companyId))
			.where(eq(clientStaffProfileTable.userId, userId))
			.limit(1),
		db
			.select({ id: affiliateProfileTable.id, pid: affiliateProfileTable.pid, status: affiliateProfileTable.status })
			.from(affiliateProfileTable)
			.where(eq(affiliateProfileTable.userId, userId)),
		countAccountRecords(userId)
	]);

	const companies = practice
		? await db
				.select({ id: clientCompanyTable.id, name: clientCompanyTable.companyName })
				.from(clientCompanyTable)
				.where(eq(clientCompanyTable.clientId, practice.profileId))
				.orderBy(asc(clientCompanyTable.createdAt))
		: [];

	return {
		account: {
			id: user.id,
			email: user.email,
			firstName: user.firstName,
			lastName: user.lastName,
			role: user.role,
			verified: user.verified,
			createdAt: user.createdAt,
			updatedAt: user.updatedAt,
			completedOnboarding: user.completedOnboarding,
			onboardingStep: user.onboardingStep,
			banned: user.banned,
			banReason: user.banReason,
			banExpires: user.banExpires,
			twoFactorEnabled: user.twoFactorEnabled,
			receiveEmail: user.receiveEmail,
			receiveSms: user.receiveSms,
			timezone: user.timezone,
			hasBillingCustomer: !!user.stripeCustomerId
		},
		signInMethods: methods.map((m) => m.providerId),
		lastActiveAt: sessions?.lastActiveAt ?? null,
		practice: practice ? { ...practice, companies } : null,
		professional: professional ?? null,
		// The owner may also have a client_staff row for their own practice; that isn't "staff of".
		staffOf: user.role === 'CLIENT_STAFF' ? (staffOf ?? null) : null,
		partner: partner ?? null,
		counts
	};
}
