import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, RequestEvent } from './$types';
import { getAllDisciplines, createNewDiscipline } from '$lib/server/database/queries/disciplines';
import { message, setError, superValidate } from 'sveltekit-superforms/server';
import {
	newDisciplineSchema,
	editDisciplineSchema,
	deleteDisciplineSchema
} from '$lib/config/zod-schemas';
import { setFlash } from 'sveltekit-flash-message/server';
import { USER_ROLES } from '$lib/config/constants';
import db from '$lib/server/database/drizzle';
import { disciplineTable } from '$lib/server/database/schemas/skill';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async (event) => {
	const searchTerm = event.url.searchParams.get('search') || '';
	const user = event.locals.user;

	if (!user) redirect(302, '/auth/sign-in');
	if (user.role !== USER_ROLES.SUPERADMIN) redirect(302, '/dashboard');

	const [form, editForm, deleteForm, disciplines] = await Promise.all([
		superValidate(event, newDisciplineSchema),
		superValidate(event, editDisciplineSchema),
		superValidate(event, deleteDisciplineSchema),
		getAllDisciplines(searchTerm)
	]);

	return {
		form,
		editForm,
		deleteForm,
		disciplines: disciplines || []
	};
};

export const actions = {
	addDiscipline: async (event: RequestEvent) => {
		// Matches editDiscipline/deleteDiscipline, which have always checked. The page
		// `load` redirects non-admins, but the action itself was reachable by a direct
		// POST — and this table now carries `requires_certification`, which gates job
		// visibility, so an unauthenticated write here has real consequences.
		const user = event.locals.user;
		if (!user) redirect(302, '/auth/sign-in');
		if (user.role !== USER_ROLES.SUPERADMIN) return fail(403, { message: 'Unauthorized.' });

		const form = await superValidate(event, newDisciplineSchema);

		if (!form.valid) return fail(400, { form });

		try {
			const newDiscipline = await createNewDiscipline({
				id: crypto.randomUUID(),
				createdAt: new Date(),
				updatedAt: new Date(),
				name: form.data.name,
				abbreviation: form.data.abbreviation,
				requiresLicense: form.data.requiresLicense
			});

			if (newDiscipline) {
				setFlash({ type: 'success', message: 'Discipline created!' }, event);
			}
		} catch (e) {
			console.error(e);
			setFlash({ type: 'error', message: 'Discipline was not able to be created.' }, event);
			return setError(form, 'Error creating discipline.');
		}

		return message(form, 'Discipline added successfully.');
	},

	editDiscipline: async (event: RequestEvent) => {
		const user = event.locals.user;

		if (!user) redirect(302, '/auth/sign-in');
		if (user.role !== USER_ROLES.SUPERADMIN) return fail(403, { message: 'Unauthorized.' });

		const form = await superValidate(event, editDisciplineSchema);

		if (!form.valid) return fail(400, { form });

		try {
			await db
				.update(disciplineTable)
				.set({
					name: form.data.name,
					abbreviation: form.data.abbreviation,
					// Must be written explicitly. The edit dialog seeds this from the row
					// (see openEditDialog); if either side is missed, saving an unrelated
					// field would silently reset the flag to false and un-gate every
					// professional holding this discipline.
					requiresLicense: form.data.requiresLicense,
					updatedAt: new Date()
				})
				.where(eq(disciplineTable.id, form.data.id));

			setFlash({ type: 'success', message: 'Discipline updated successfully.' }, event);
		} catch (e) {
			console.error(e);
			setFlash({ type: 'error', message: 'Discipline was not able to be updated.' }, event);
			return setError(form, 'Error updating discipline.');
		}

		return message(form, 'Discipline updated successfully.');
	},

	deleteDiscipline: async (event: RequestEvent) => {
		const user = event.locals.user;

		if (!user) redirect(302, '/auth/sign-in');
		if (user.role !== USER_ROLES.SUPERADMIN) return fail(403, { message: 'Unauthorized.' });

		const form = await superValidate(event, deleteDisciplineSchema);

		if (!form.valid) return fail(400, { form });

		try {
			await db.delete(disciplineTable).where(eq(disciplineTable.id, form.data.id));

			setFlash({ type: 'success', message: 'Discipline deleted successfully.' }, event);
		} catch (e) {
			console.error(e);
			setFlash({ type: 'error', message: 'Discipline was not able to be deleted.' }, event);
			return setError(form, 'Error deleting discipline.');
		}

		return message(form, 'Discipline deleted successfully.');
	}
};
