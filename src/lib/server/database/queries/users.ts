import { asc, eq, or } from 'drizzle-orm';
import db from '$lib/server/database/drizzle';
import { userInviteTable, userTable } from '$lib/server/database/schemas/auth';
import type { NewUser, UpdateUser, NewUserInvite } from '$lib/server/database/schemas/auth';
import { clientCompanyTable, clientProfileTable, clientStaffProfileTable } from '../schemas/client';

export const getUserByEmail = async (email: string) => {
	const user = await db.select().from(userTable).where(eq(userTable.email, email));
	if (user.length === 0) {
		return null;
	} else {
		return user[0];
	}
};

export const getUserByToken = async (token: string) => {
	const user = await db.select().from(userTable).where(eq(userTable.token, token));
	if (user.length === 0) {
		return null;
	} else {
		return user[0];
	}
};

export const updateUser = async (id: string, user: UpdateUser) => {
	const result = await db.update(userTable).set(user).where(eq(userTable.id, id)).returning();
	if (result.length === 0) {
		return null;
	} else {
		return result[0];
	}
};

export const createUser = async (values: NewUser, tx?: any) => {
	try {
		const query = tx || db; // Use transaction if provided, otherwise use db

		const [user] = await query.insert(userTable).values(values).returning();

		return user;
	} catch (err) {
		console.log(err);
		throw new Error(`Error creating new user: ${err}`);
	}
};

export const getUserById = async (userId: string) => {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const { password, ...rest } = userTable;
	try {
		const user = await db
			.select({ user: { ...rest } })
			.from(userTable)
			.where(eq(userTable.id, userId))
			.limit(1);

		return user[0] || null;
	} catch (err) {
		console.log(err);
	}
};

export async function getUsersInCompany(companyId: string) {
	try {
		const users = await db
			.select({
				id: userTable.id,
				email: userTable.email,
				firstName: userTable.firstName,
				lastName: userTable.lastName,
				avatarUrl: userTable.avatarUrl
			})
			.from(userTable)
			.leftJoin(clientStaffProfileTable, eq(clientStaffProfileTable.userId, userTable.id))
			.leftJoin(clientProfileTable, eq(clientProfileTable.id, clientStaffProfileTable.clientId))
			.where(eq(clientStaffProfileTable.companyId, companyId))
			.orderBy(asc(userTable.firstName));

		return users;
	} catch (err) {
		console.log(err);
		return [];
	}
}
