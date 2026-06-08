import { count, desc, eq, ilike, or, sql } from 'drizzle-orm';
import db from '../drizzle';
import { disciplineTable, type Discipline, type UpdateDiscipline } from '../schemas/skill';
import type { PaginateOptions } from '$lib/types';
import { DEFAULT_MAX_RECORD_LIMIT } from '$lib/config/constants';
import { error } from '@sveltejs/kit';

export type DisciplinesRaw = {
	id: string;
	name: string;
	abbreviation: string;
};

export type DisciplineResults = DisciplinesRaw[];

export async function getAllDisciplines(searchTerm?: string) {
	try {
		const results = await db
			.select()
			.from(disciplineTable)
			.where(
				searchTerm
					? or(
							ilike(disciplineTable.name, `%${searchTerm}%`),
							ilike(disciplineTable.abbreviation, `%${searchTerm}%`)
						)
					: undefined
			)
			.orderBy(desc(disciplineTable.createdAt))
			.limit(DEFAULT_MAX_RECORD_LIMIT);

		return results;
	} catch (err) {
		console.error('Error fetching disciplines:', err);
		throw error(500, 'Failed to fetch disciplines');
	}
}

export async function getPaginatedDisciplines({
	limit = 25,
	offset = 0,
	orderBy = undefined
}: PaginateOptions) {
	try {
		const orderSelector = orderBy ? `d.${orderBy.column}` : null;

		const query = sql.empty();

		query.append(sql`
      SELECT d.*
      FROM ${disciplineTable} AS d
    `);

		if (orderSelector && orderBy) {
			query.append(sql`
    ORDER BY ${
			orderBy.direction === 'asc'
				? sql`${sql.raw(orderSelector)} ASC`
				: sql`${sql.raw(orderSelector)} DESC`
		}
  `);
		} else {
			query.append(sql`
    ORDER BY d.created_at DESC
  `);
		}

		query.append(sql`
      LIMIT ${limit}
      OFFSET ${offset}
    `);

		const countResult = await db.select({ value: count() }).from(disciplineTable);
		const results = await db.execute(query);

		return {
			disciplines: results.rows,
			count: countResult[0].value
		};
	} catch (error) {
		console.error(error);
	}
}

export async function createNewDiscipline(values: Discipline) {
	const result = await db.insert(disciplineTable).values(values).onConflictDoNothing().returning();

	if (result.length === 0) {
		return null;
	} else {
		return result[0];
	}
}

export async function updateDiscipline(id: string, values: UpdateDiscipline) {
	const result = await db
		.update(disciplineTable)
		.set(values)
		.where(eq(disciplineTable.id, id))
		.returning();

	if (result.length === 0) {
		return null;
	} else {
		return result[0];
	}
}

export async function deleteDiscipline(id: string) {
	const result = await db.delete(disciplineTable).where(eq(disciplineTable.id, id)).returning();

	if (result.length === 0) {
		return null;
	} else {
		return result[0];
	}
}
