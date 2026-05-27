// Temporary helper: dumps every discipline + experience-level row in the DB
// so we can populate the backfill alias map. Delete after use.
import db from '../database/drizzle';
import { disciplineTable, experienceLevelTable } from '../database/schemas/skill';

async function main() {
	const disciplines = await db
		.select({ id: disciplineTable.id, name: disciplineTable.name, abbr: disciplineTable.abbreviation })
		.from(disciplineTable)
		.orderBy(disciplineTable.name);
	console.log('--- DISCIPLINES (' + disciplines.length + ') ---');
	for (const d of disciplines) {
		console.log(`  "${d.name}"   (abbr: ${d.abbr ?? '—'})`);
	}

	const exps = await db
		.select({ id: experienceLevelTable.id, value: experienceLevelTable.value })
		.from(experienceLevelTable)
		.orderBy(experienceLevelTable.value);
	console.log('--- EXPERIENCE LEVELS (' + exps.length + ') ---');
	for (const e of exps) {
		console.log(`  "${e.value}"`);
	}
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error(err);
		process.exit(1);
	});
