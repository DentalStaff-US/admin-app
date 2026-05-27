import db from '$lib/server/database/drizzle';
import { adminConfigTable } from '$lib/server/database/schemas/config';

const METERS_PER_MILE = 1609.34;
const FALLBACK_RADIUS_MILES = 60;

export async function getDefaultSearchRadius(): Promise<{ miles: number; meters: number }> {
	const [row] = await db
		.select({ miles: adminConfigTable.defaultSearchRadiusMiles })
		.from(adminConfigTable)
		.limit(1);
	const miles = row?.miles ?? FALLBACK_RADIUS_MILES;
	return { miles, meters: miles * METERS_PER_MILE };
}
