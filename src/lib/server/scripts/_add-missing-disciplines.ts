// One-off: insert 4 disciplines into the `disciplines` table that the CSV
// backfill needs but don't exist yet. Idempotent — skips any name already
// present. Delete after use.
//
// Run:   npx tsx src/lib/server/scripts/_add-missing-disciplines.ts
import db from '../database/drizzle';
import { disciplineTable } from '../database/schemas/skill';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

const NEW_DISCIPLINES = [
	{ name: 'Director of Ops', abbreviation: 'DOO' },
	{ name: 'General Manager', abbreviation: 'GM' },
	{ name: 'Owner/Operator', abbreviation: 'OO' },
	{ name: 'General Laborer', abbreviation: 'GL' }
];

async function main() {
	for (const d of NEW_DISCIPLINES) {
		const [existing] = await db
			.select({ id: disciplineTable.id })
			.from(disciplineTable)
			.where(eq(disciplineTable.name, d.name))
			.limit(1);
		if (existing) {
			console.log(`SKIP "${d.name}" — already exists (id=${existing.id})`);
			continue;
		}
		const now = new Date();
		const [inserted] = await db
			.insert(disciplineTable)
			.values({
				id: randomUUID(),
				name: d.name,
				abbreviation: d.abbreviation,
				createdAt: now,
				updatedAt: now
			})
			.returning({ id: disciplineTable.id, name: disciplineTable.name });
		console.log(`INSERTED "${inserted.name}" (id=${inserted.id})`);
	}
	console.log('Done.');
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error(err);
		process.exit(1);
	});
