import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/database/drizzle';
import { companyOfficeLocationTable } from '$lib/server/database/schemas/client';
import { and, isNull, isNotNull } from 'drizzle-orm';

export const GET: RequestHandler = async () => {
	try {
		const pendingLocations = await db
			.select({
				id: companyOfficeLocationTable.id,
				completeAddress: companyOfficeLocationTable.completeAddress
			})
			.from(companyOfficeLocationTable)
			.where(
				and(
					isNull(companyOfficeLocationTable.lat),
					isNotNull(companyOfficeLocationTable.completeAddress)
				)
			);

		return json({
			count: pendingLocations.length,
			locations: pendingLocations
		});
	} catch (error) {
		console.error('Error checking pending locations:', error);
		return json({ count: 0, error: 'Failed to check' }, { status: 500 });
	}
};
