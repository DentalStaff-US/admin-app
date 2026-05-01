import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, RequestEvent } from './$types';
import {
	createNewExperienceLevel,
	getAllExperienceLevels
} from '$lib/server/database/queries/skills';
import { message, setError, superValidate } from 'sveltekit-superforms/server';
import { newExperienceLevelSchema } from '$lib/config/zod-schemas';
import { setFlash } from 'sveltekit-flash-message/server';
import { USER_ROLES } from '$lib/config/constants';
import db from '$lib/server/database/drizzle';
import { experienceLevelTable } from '$lib/server/database/schemas/skill';
import { eq, max } from 'drizzle-orm';
import { z } from 'zod';

const experienceLevelSchema = newExperienceLevelSchema.pick({
	value: true
});

const reorderSchema = z.object({
	order: z
		.string()
		.transform((s, ctx) => {
			try {
				const parsed = JSON.parse(s);
				const arr = z
					.array(z.object({ id: z.string().min(1), order: z.number().int().min(0) }))
					.parse(parsed);
				return arr;
			} catch {
				ctx.addIssue({ code: 'custom', message: 'Invalid order payload' });
				return z.NEVER;
			}
		})
});

export const load: PageServerLoad = async (event) => {
	const searchTerm = event.url.searchParams.get('search') || '';
	const user = event.locals.user;

	if (!user) {
		redirect(302, '/auth/sign-in');
	}

	if (user && user.role !== USER_ROLES.SUPERADMIN) {
		redirect(302, '/dashboard');
	}

	const form = await superValidate(event, experienceLevelSchema);
	const experienceLevels = await getAllExperienceLevels(searchTerm);

	return {
		form,
		experienceLevels: experienceLevels || []
	};
};

export const actions = {
	addExperienceLevel: async (event: RequestEvent) => {
		const form = await superValidate(event, experienceLevelSchema);

		if (!form.valid) {
			return fail(400, {
				form
			});
		}

		try {
			const experienceLevelId = crypto.randomUUID();
			const [{ maxOrder }] = await db
				.select({ maxOrder: max(experienceLevelTable.order) })
				.from(experienceLevelTable);
			const nextOrder = (maxOrder ?? -1) + 1;

			const newExperienceLevel = await createNewExperienceLevel({
				id: experienceLevelId,
				value: form.data.value,
				order: nextOrder,
				createdAt: new Date(),
				updatedAt: new Date()
			});

			if (newExperienceLevel) {
				setFlash(
					{
						type: 'success',
						message: 'Experience Level created!'
					},
					event
				);
			}
		} catch (e) {
			console.error(e);
			setFlash({ type: 'error', message: 'Experience Level was not able to be created.' }, event);
			return setError(form, 'Error creating experience level.');
		}

		console.log('Experience Level added successfully');
		return message(form, 'Experience Level added successfully.');
	},

	deleteExperienceLevel: async (event: RequestEvent) => {
		const user = event.locals.user;

		if (!user) {
			redirect(302, '/auth/sign-in');
		}

		if (user.role !== 'SUPERADMIN') {
			return fail(403, { message: 'You do not have permission to delete experience levels.' });
		}

		const form = await superValidate(event, z.object({ id: z.string().min(1) }));

		if (!form.valid) {
			return fail(400, {
				form
			});
		}

		const experienceLevelId = form.data.id;

		if (!experienceLevelId) {
			return fail(400, { message: 'Experience Level ID is required.' });
		}

		try {
			await db.delete(experienceLevelTable).where(eq(experienceLevelTable.id, experienceLevelId));

			setFlash(
				{
					type: 'success',
					message: 'Experience Level deleted successfully.'
				},
				event
			);
		} catch (e) {
			console.error(e);
			setFlash({ type: 'error', message: 'Experience Level was not able to be deleted.' }, event);
			return setError(form, 'Error deleting experience level.');
		}

		console.log('Experience Level deleted successfully');
		return message(form, 'Experience Level deleted successfully.');
	},

	reorderExperienceLevels: async (event: RequestEvent) => {
		const user = event.locals.user;
		if (!user) redirect(302, '/auth/sign-in');
		if (user.role !== USER_ROLES.SUPERADMIN) {
			return fail(403, { message: 'You do not have permission to reorder experience levels.' });
		}

		const form = await superValidate(event, reorderSchema);
		if (!form.valid) {
			setFlash({ type: 'error', message: 'Invalid reorder payload' }, event);
			return fail(400, { form });
		}

		try {
			await db.transaction(async (tx) => {
				for (const row of form.data.order) {
					await tx
						.update(experienceLevelTable)
						.set({ order: row.order, updatedAt: new Date() })
						.where(eq(experienceLevelTable.id, row.id));
				}
			});
			setFlash({ type: 'success', message: 'Order saved.' }, event);
			return { success: true };
		} catch (e) {
			console.error('Error reordering experience levels:', e);
			setFlash({ type: 'error', message: 'Failed to save order.' }, event);
			return fail(500, { message: 'Failed to save order.' });
		}
	}
};
