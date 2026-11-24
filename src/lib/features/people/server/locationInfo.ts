/**
 * Quick edit from the locations tables (EditLocationDialog): name and contact
 * details. The caller checks access to the location first.
 */
import { fail } from '@sveltejs/kit';
import { LocationInfoSchema } from '$lib/config/zod-schemas';
import { updateCompanyLocation } from '$lib/server/database/queries/clients';
import { logger } from '$lib/server/logger';

export async function saveLocationInfo(locationId: string, formData: FormData) {
	const parsed = LocationInfoSchema.safeParse(Object.fromEntries(formData));
	if (!parsed.success) return fail(400, { locationErrors: parsed.error.flatten().fieldErrors });

	try {
		const saved = await updateCompanyLocation(locationId, parsed.data);
		if (!saved) return fail(404, { locationErrors: { name: ['This location no longer exists.'] } });
		return { locationSaved: saved.name };
	} catch (err) {
		logger.error('failed to save location info', { error: err, locationId });
		return fail(500, { locationErrors: { name: ['The location could not be saved. Try again.'] } });
	}
}
