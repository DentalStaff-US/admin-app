import { and, desc, eq, ilike, or } from 'drizzle-orm';
import db from '../drizzle';
import {
	supportTicketCommentTable,
	supportTicketTable,
	type SupportTicket,
	type SupportTicketComment,
	type UpdateSuportTicket
} from '../schemas/admin';
import { userTable } from '../schemas/auth';
import { error } from '@sveltejs/kit';
import { getClientProfileById } from './clients';
import { getUserById } from './users';
import { DEFAULT_MAX_RECORD_LIMIT } from '$lib/config/constants';
import { writeActionHistory } from './admin';

export interface SupportTicketResult {
	supportTicket: SupportTicket;
	reportedBy: {
		id: string;
		firstName: string;
		lastName: string;
		email: string;
		avatarUrl: string;
		role: string;
	};
}

export async function createSupportTicket(data: SupportTicket) {
	try {
		const [result] = await db
			.insert(supportTicketTable)
			.values(data)
			.onConflictDoNothing()
			.returning();
		return result;
	} catch (err) {
		console.log(err);
		return error(500, `${err}`);
	}
}

export async function getAllSupportTickets(searchTerm?: string) {
	return await db
		.select({
			supportTicket: { ...supportTicketTable },
			reportedBy: {
				id: userTable.id,
				firstName: userTable.firstName,
				lastName: userTable.lastName,
				email: userTable.email,
				avatarUrl: userTable.avatarUrl,
				role: userTable.role
			}
		})
		.from(supportTicketTable)
		.where(
			or(
				searchTerm ? ilike(supportTicketTable.title, `%${searchTerm}%`) : undefined,
				searchTerm ? ilike(userTable.firstName, `%${searchTerm}%`) : undefined,
				searchTerm ? ilike(userTable.lastName, `%${searchTerm}%`) : undefined
			)
		)
		.innerJoin(userTable, eq(supportTicketTable.reportedById, userTable.id))
		.orderBy(desc(supportTicketTable.updatedAt))
		.limit(DEFAULT_MAX_RECORD_LIMIT);
}

export async function getSupportTicketsForClient(clientId: string | undefined) {
	if (!clientId) return error(400, 'Client ID required');

	const client = await getClientProfileById(clientId);
	if (!client) return error(404, 'Client not found');

	const clientUser = await getUserById(client.user.id);
	if (!clientUser) return error(404, 'Client not found');

	try {
		const tickets = await db
			.select()
			.from(supportTicketTable)
			.where(eq(supportTicketTable.reportedById, clientUser.user.id))
			.limit(DEFAULT_MAX_RECORD_LIMIT);

		return tickets;
	} catch (err) {
		console.log(err);
		return error(500, `${err}`);
	}
}

export async function getSupportTicketsForUser(userID?: string, searchTerm?: string) {
	if (!userID) return error(400, 'User ID required');
	return await db
		.select({
			supportTicket: { ...supportTicketTable },
			reportedBy: {
				id: userTable.id,
				firstName: userTable.firstName,
				lastName: userTable.lastName,
				email: userTable.email,
				avatarUrl: userTable.avatarUrl,
				role: userTable.role
			}
		})
		.from(supportTicketTable)
		.innerJoin(userTable, eq(supportTicketTable.reportedById, userTable.id))
		.where(
			and(
				eq(supportTicketTable.reportedById, userID),
				or(
					searchTerm ? ilike(supportTicketTable.title, `%${searchTerm}%`) : undefined,
					searchTerm ? ilike(userTable.firstName, `%${searchTerm}%`) : undefined,
					searchTerm ? ilike(userTable.lastName, `%${searchTerm}%`) : undefined
				)
			)
		)
		.orderBy(desc(supportTicketTable.updatedAt))
		.limit(DEFAULT_MAX_RECORD_LIMIT);
}

export async function getSupportTicketsForUserWithLimit(userID: string, count: number) {
	if (!userID) return error(400, 'User ID required');
	return await db
		.select({
			supportTicket: { ...supportTicketTable },
			reportedBy: {
				id: userTable.id,
				firstName: userTable.firstName,
				lastName: userTable.lastName,
				email: userTable.email,
				avatarUrl: userTable.avatarUrl,
				role: userTable.role
			}
		})
		.from(supportTicketTable)
		.innerJoin(userTable, eq(supportTicketTable.reportedById, userTable.id))
		.where(eq(supportTicketTable.reportedById, userID))
		.orderBy(desc(supportTicketTable.updatedAt))
		.limit(count);
}

export async function closeSupportTicket(ticketId: string, closedById: string) {
	const [original] = await db
		.select()
		.from(supportTicketTable)
		.where(eq(supportTicketTable.id, ticketId));
	if (!original) {
		throw error(404, 'TICKET NOT FOUND');
	}
	const [result] = await db
		.update(supportTicketTable)
		.set({ closedById: closedById })
		.where(eq(supportTicketTable.id, ticketId))
		.returning();

	await writeActionHistory({
		table: 'SUPPORT_TICKETS',
		userId: closedById,
		action: 'UPDATE',
		entityId: ticketId,
		beforeState: original,
		afterState: result
	});
	return result;
}

export async function deleteSupportTicket(ticketId: string, userId: string) {
	const [original] = await db
		.select()
		.from(supportTicketTable)
		.where(eq(supportTicketTable.id, ticketId));
	if (!original) {
		throw error(404, 'TICKET NOT FOUND');
	}
	const [result] = await db
		.delete(supportTicketTable)
		.where(eq(supportTicketTable.id, ticketId))
		.returning();
	await writeActionHistory({
		table: 'SUPPORT_TICKETS',
		userId,
		action: 'DELETE',
		entityId: ticketId,
		beforeState: original,
		afterState: result
	});
	return result;
}

export async function getSupportTicketDetails(ticketId: string) {
	const ticket = await db
		.select({
			ticket: supportTicketTable,
			reportedBy: {
				id: userTable.id,
				firstName: userTable.firstName,
				lastName: userTable.lastName,
				email: userTable.email,
				avatarUrl: userTable.avatarUrl,
				role: userTable.role
			}
		})
		.from(supportTicketTable)
		.leftJoin(userTable, eq(supportTicketTable.reportedById, userTable.id))
		.where(eq(supportTicketTable.id, ticketId));

	if (!ticket || ticket.length === 0) {
		throw new Error('TICKET NOT FOUND');
	}

	const closedByUser = await db
		.select({
			id: userTable.id,
			firstName: userTable.firstName,
			lastName: userTable.lastName,
			email: userTable.email,
			avatarUrl: userTable.avatarUrl,
			role: userTable.role
		})
		.from(userTable)
		.where(eq(userTable.id, ticket[0].ticket.closedById as string));

	const comments = await db
		.select({
			comment: supportTicketCommentTable,
			user: {
				id: userTable.id,
				firstName: userTable.firstName,
				lastName: userTable.lastName,
				email: userTable.email,
				avatarUrl: userTable.avatarUrl,
				role: userTable.role
			}
		})
		.from(supportTicketCommentTable)
		.leftJoin(userTable, eq(supportTicketCommentTable.fromId, userTable.id))
		.where(eq(supportTicketCommentTable.supportTicketId, ticketId));

	return {
		details: {
			...ticket[0],
			closedBy: closedByUser[0] || null
		},
		comments
	};
}

export const getSupportTicketComments = async (ticketId: string) => {
	try {
		const result = await db
			.select()
			.from(supportTicketCommentTable)
			.where(eq(supportTicketCommentTable.supportTicketId, ticketId));

		return result || [];
	} catch (err) {
		console.log(err);
		return error(500, `${err}`);
	}
};

export const createSupportTicketComment = async (data: SupportTicketComment, userId: string) => {
	try {
		const [result] = await db
			.insert(supportTicketCommentTable)
			.values(data)
			.onConflictDoNothing()
			.returning();

		await updateSupportTicket(
			data.supportTicketId,
			{
				updatedAt: new Date()
			},
			userId
		);
		return result;
	} catch (err) {
		console.log(err);
		return error(500, `${err}`);
	}
};

export async function updateSupportTicket(
	ticketId: string,
	data: UpdateSuportTicket,
	userId: string
) {
	try {
		const [original] = await db
			.select()
			.from(supportTicketTable)
			.where(eq(supportTicketTable.id, ticketId));
		if (!original) {
			throw error(404, 'TICKET NOT FOUND');
		}
		const [result] = await db
			.update(supportTicketTable)
			.set({ ...data, updatedAt: new Date() })
			.where(eq(supportTicketTable.id, ticketId))
			.returning();
		await writeActionHistory({
			table: 'SUPPORT_TICKETS',
			userId,
			action: 'DELETE',
			entityId: ticketId,
			beforeState: original,
			afterState: result
		});
		return result;
	} catch (err) {
		console.log(err);
		return error(500, `${err}`);
	}
}
