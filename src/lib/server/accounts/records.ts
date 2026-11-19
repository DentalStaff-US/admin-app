/**
 * What hangs off one user: record counts for the admin user page and the
 * lifecycle guards, and the storage keys of the files their profiles own.
 */
import { and, eq, notInArray, sql } from 'drizzle-orm';
import db from '$lib/server/database/drizzle';
import type { DbExecutor } from '$lib/server/audit/audit';
import { userTable } from '$lib/server/database/schemas/auth';
import {
	candidateDocumentUploadsTable,
	candidateProfileTable
} from '$lib/server/database/schemas/candidate';
import {
	clientCompanyTable,
	clientDocumentUploadsTable,
	clientProfileTable
} from '$lib/server/database/schemas/client';
import { uploadUrlToKey } from '$lib/server/certifications/credentialLink';
import type { AccountRecordCounts } from '$features/admin/components/people/accountControls';

/**
 * One round trip. The business-record subqueries mirror
 * findUsersWithBusinessRecords (queries/admin.ts), which stays the authority
 * for hard deletes.
 */
export async function countAccountRecords(userId: string, exec: DbExecutor = db): Promise<AccountRecordCounts> {
	const { rows } = await exec.execute(sql`
		with cp as (select id from candidate_profiles where user_id = ${userId}),
		clp as (select id from client_profiles where user_id = ${userId}),
		cc as (select id from client_companies where client_id in (select id from clp)),
		ap as (select id from affiliate_profiles where user_id = ${userId})
		select
			(select count(*) from requisitions where client_id in (select id from cc))::int as requisitions,
			(select count(*) from invoices where client_id in (select id from clp))::int as invoices,
			(select count(*) from timesheets where associated_client_id in (select id from clp))::int as client_timesheets,
			(select count(*) from workdays where candidate_id in (select id from cp))::int as workdays,
			(select count(*) from timesheets where associated_candidate_id in (select id from cp))::int as candidate_timesheets,
			(select count(*) from requisition_application where candidate_id in (select id from cp))::int as applications,
			(select count(*) from affiliate_payouts where affiliate_id in (select id from ap))::int as payouts,
			(select count(*) from affiliate_commission_events where affiliate_id in (select id from ap))::int as commissions,
			(select count(*) from client_staff where client_id in (select id from clp) and user_id <> ${userId})::int as staff_members,
			(select count(*) from cc)::int as companies,
			(select count(*) from company_office_locations where company_id in (select id from cc))::int as locations,
			(select count(*) from client_document_uploads where client_id in (select id from clp))::int as client_documents,
			(select count(*) from candidate_document_uploads where candidate_id in (select id from cp))::int as candidate_documents,
			(select count(*) from signature_requests where client_id in (select id from clp))::int as signature_requests,
			(select count(distinct p.conversation_id) from conversation_participants p
				join conversations c on c.id = p.conversation_id
				where p.user_id = ${userId} and c.type <> 'INTERNAL')::int as conversations,
			(select count(*) from messages where sender_id = ${userId})::int as messages_sent,
			(select count(*) from sessions where user_id = ${userId} and expires_at > now())::int as active_sessions
	`);
	const r = rows[0] as Record<string, number>;
	return {
		requisitions: r.requisitions,
		invoices: r.invoices,
		clientTimesheets: r.client_timesheets,
		workdays: r.workdays,
		candidateTimesheets: r.candidate_timesheets,
		applications: r.applications,
		payouts: r.payouts,
		commissions: r.commissions,
		staffMembers: r.staff_members,
		companies: r.companies,
		locations: r.locations,
		clientDocuments: r.client_documents,
		candidateDocuments: r.candidate_documents,
		signatureRequests: r.signature_requests,
		conversations: r.conversations,
		messagesSent: r.messages_sent,
		activeSessions: r.active_sessions
	};
}

/**
 * The bucket key for a stored file, or null when it isn't ours. Private uploads
 * store the bare key; public ones store the Spaces CDN URL. Any other URL (a
 * Google avatar, say) is left alone.
 */
export function ownedStorageKey(stored: string | null | undefined): string | null {
	if (!stored) return null;
	if (!stored.includes('://')) return stored;
	try {
		const host = new URL(stored).hostname;
		if (!host.endsWith('digitaloceanspaces.com') && !host.endsWith('amazonaws.com')) return null;
	} catch {
		return null;
	}
	return uploadUrlToKey(stored);
}

const keysOf = (rows: { url: string | null }[]) =>
	rows.map((r) => ownedStorageKey(r.url)).filter((k): k is string => !!k);

/** Documents and practice logos under the user's practice profile. */
export async function practiceFileKeys(userId: string, exec: DbExecutor = db): Promise<string[]> {
	const [docs, logos] = await Promise.all([
		exec
			.select({ url: clientDocumentUploadsTable.uploadUrl })
			.from(clientDocumentUploadsTable)
			.innerJoin(clientProfileTable, eq(clientProfileTable.id, clientDocumentUploadsTable.clientId))
			.where(eq(clientProfileTable.userId, userId)),
		exec
			.select({ url: clientCompanyTable.companyLogo })
			.from(clientCompanyTable)
			.innerJoin(clientProfileTable, eq(clientProfileTable.id, clientCompanyTable.clientId))
			.where(eq(clientProfileTable.userId, userId))
	]);
	return [...keysOf(docs), ...keysOf(logos)];
}

/** Documents under the user's professional profile, optionally skipping some types. */
export async function professionalFileKeys(
	userId: string,
	exec: DbExecutor = db,
	opts: { keepTypes?: readonly string[] } = {}
): Promise<string[]> {
	const rows = await exec
		.select({ url: candidateDocumentUploadsTable.uploadUrl })
		.from(candidateDocumentUploadsTable)
		.innerJoin(candidateProfileTable, eq(candidateProfileTable.id, candidateDocumentUploadsTable.candidateId))
		.where(
			and(
				eq(candidateProfileTable.userId, userId),
				opts.keepTypes?.length
					? notInArray(candidateDocumentUploadsTable.type, opts.keepTypes as never[])
					: undefined
			)
		);
	return keysOf(rows);
}

export async function avatarKey(userId: string, exec: DbExecutor = db): Promise<string[]> {
	const [row] = await exec.select({ url: userTable.avatarUrl }).from(userTable).where(eq(userTable.id, userId));
	const key = ownedStorageKey(row?.url);
	return key ? [key] : [];
}

/** Candidate profile ids for a user (normally one). */
export async function professionalProfileIds(userId: string, exec: DbExecutor = db): Promise<string[]> {
	const rows = await exec
		.select({ id: candidateProfileTable.id })
		.from(candidateProfileTable)
		.where(eq(candidateProfileTable.userId, userId));
	return rows.map((r: { id: string }) => r.id);
}
