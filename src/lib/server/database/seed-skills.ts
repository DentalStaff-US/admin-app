/**
 * Load the starter skill taxonomy (constants.ts → skillsByCategory) into the
 * skill tables. Run AFTER migration 0066.
 *
 * Idempotent and additive: categories and skills are matched on case-insensitive
 * name; existing rows are left untouched (no renames, no un-archiving, no deletes),
 * so this is safe to re-run and never overwrites edits made in the admin pages.
 * Discipline tags are only applied to categories this run CREATES.
 *
 * Usage (from dental-staff-app/):
 *   npx tsx src/lib/server/database/seed-skills.ts --dry-run
 *   npx tsx src/lib/server/database/seed-skills.ts
 *
 * Mind which DATABASE_URL is active in .env — and run against both databases.
 */
import { sql } from 'drizzle-orm';
import db from './drizzle';
import {
	disciplineTable,
	skillCategoryDisciplineTable,
	skillCategoryTable,
	skillTable
} from './schemas/skill';
import { skillsByCategory } from '../../config/constants';

const dryRun = process.argv.includes('--dry-run');

async function main() {
	const disciplines = await db.select().from(disciplineTable);
	const byAbbr = new Map(disciplines.map((d) => [d.abbreviation.toLowerCase(), d.id]));
	const categories = await db.select().from(skillCategoryTable);
	const skills = await db.select().from(skillTable);

	let createdCategories = 0;
	let createdSkills = 0;

	const maxCatOrder = Math.max(-1, ...categories.map((c) => c.sortOrder));
	let nextCatOrder = maxCatOrder + 1;

	for (const seed of skillsByCategory) {
		let category = categories.find((c) => c.name.toLowerCase() === seed.name.toLowerCase());

		if (!category) {
			const disciplineIds = (seed.disciplines ?? [])
				.map((a) => {
					const id = byAbbr.get(a.toLowerCase());
					if (!id)
						console.warn(
							`  ! discipline "${a}" not found — "${seed.name}" will not be scoped to it`
						);
					return id;
				})
				.filter((x): x is string => !!x);

			console.log(
				`+ category ${seed.name}${disciplineIds.length ? ` [${seed.disciplines?.join(', ')}]` : ' [all]'}`
			);
			createdCategories++;
			if (!dryRun) {
				const [row] = await db
					.insert(skillCategoryTable)
					.values({
						id: crypto.randomUUID(),
						name: seed.name,
						description: seed.description ?? null,
						sortOrder: nextCatOrder++
					})
					.returning();
				if (disciplineIds.length) {
					await db
						.insert(skillCategoryDisciplineTable)
						.values(disciplineIds.map((disciplineId) => ({ categoryId: row.id, disciplineId })));
				}
				category = row;
			}
		}

		const existing = category ? skills.filter((s) => s.categoryId === category!.id) : [];
		let nextSkillOrder = Math.max(-1, ...existing.map((s) => s.sortOrder)) + 1;

		for (const s of seed.skills) {
			if (existing.some((e) => e.name.toLowerCase() === s.name.toLowerCase())) continue;
			console.log(`    + skill ${s.name}${s.cert ? ' (certificate required)' : ''}`);
			createdSkills++;
			if (!dryRun && category) {
				await db.insert(skillTable).values({
					id: crypto.randomUUID(),
					categoryId: category.id,
					name: s.name,
					requiresCertificate: !!s.cert,
					sortOrder: nextSkillOrder++
				});
			}
		}
	}

	const [{ n }] = (await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM skills`))
		.rows;
	console.log(
		`${dryRun ? '[dry run] would create' : 'created'} ${createdCategories} categories, ${createdSkills} skills. skills table now has ${n} rows${dryRun ? ' (unchanged)' : ''}.`
	);
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error(e);
		process.exit(1);
	});
