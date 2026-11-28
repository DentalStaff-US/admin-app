/**
 * ⌘K jump-to search for DTSS admins (design doc 05 › Top bar): find a
 * professional, practice or requisition by name or number. Admin only; the
 * endpoint enforces that. Each kind returns a handful of rows, newest first.
 */
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import db from '$lib/server/database/drizzle';
import { userTable } from '$lib/server/database/schemas/auth';
import { candidateProfileTable } from '$lib/server/database/schemas/candidate';
import { clientCompanyTable, clientProfileTable } from '$lib/server/database/schemas/client';
import { requisitionTable } from '$lib/server/database/schemas/requisition';
import { disciplineTable } from '$lib/server/database/schemas/skill';

export type SearchHit = {
	kind: 'professional' | 'client' | 'requisition';
	label: string;
	detail: string;
	href: string;
};

const LIMIT = 5;

/** Escape LIKE wildcards so a typed % or _ matches literally. */
export const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export async function commandSearch(rawQuery: string): Promise<SearchHit[]> {
	const q = rawQuery.trim().replace(/^#/, '');
	if (q.length < 2 && !/^\d+$/.test(q)) return [];
	const pattern = likePattern(q);

	const [professionals, clients, requisitions] = await Promise.all([
		db
			.select({
				id: candidateProfileTable.id,
				firstName: userTable.firstName,
				lastName: userTable.lastName,
				email: userTable.email
			})
			.from(candidateProfileTable)
			.innerJoin(userTable, eq(candidateProfileTable.userId, userTable.id))
			.where(
				or(
					ilike(sql`${userTable.firstName} || ' ' || ${userTable.lastName}`, pattern),
					ilike(userTable.email, pattern)
				)
			)
			.orderBy(desc(candidateProfileTable.createdAt))
			.limit(LIMIT),
		db
			.select({ id: clientProfileTable.id, name: clientCompanyTable.companyName, email: userTable.email })
			.from(clientCompanyTable)
			.innerJoin(clientProfileTable, eq(clientCompanyTable.clientId, clientProfileTable.id))
			.innerJoin(userTable, eq(clientProfileTable.userId, userTable.id))
			.where(or(ilike(clientCompanyTable.companyName, pattern), ilike(userTable.email, pattern)))
			.orderBy(desc(clientCompanyTable.createdAt))
			.limit(LIMIT),
		db
			.select({
				id: requisitionTable.id,
				discipline: disciplineTable.name,
				company: clientCompanyTable.companyName,
				status: requisitionTable.status
			})
			.from(requisitionTable)
			.innerJoin(clientCompanyTable, eq(requisitionTable.companyId, clientCompanyTable.id))
			.leftJoin(disciplineTable, eq(requisitionTable.disciplineId, disciplineTable.id))
			.where(
				/^\d+$/.test(q)
					? eq(requisitionTable.id, Number(q))
					: and(eq(requisitionTable.archived, false), ilike(clientCompanyTable.companyName, pattern))
			)
			.orderBy(desc(requisitionTable.id))
			.limit(LIMIT)
	]);

	return [
		...requisitions.map((r) => ({
			kind: 'requisition' as const,
			label: `#${r.id} · ${r.discipline ?? 'Requisition'}`,
			detail: [r.company, r.status].filter(Boolean).join(' · '),
			href: `/requisitions/${r.id}`
		})),
		...professionals.map((p) => ({
			kind: 'professional' as const,
			label: `${p.firstName} ${p.lastName}`.trim(),
			detail: p.email,
			href: `/professionals/${p.id}`
		})),
		...clients.map((c) => ({
			kind: 'client' as const,
			label: c.name ?? 'Unnamed practice',
			detail: c.email,
			href: `/clients/${c.id}`
		}))
	];
}
