import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { z } from 'zod';
import { setFlash } from 'sveltekit-flash-message/server';
import {
	createNewSkillCategory,
	deleteSkillCategoryIfUnused,
	getAllSkillCategories,
	getAllDisciplines,
	isUniqueViolation,
	reorderSkillCategories,
	updateSkillCategory
} from '$lib/server/database/queries/skills';
import { USER_ROLES } from '$lib/config/constants';

/**
 * Skill categories: name, description, which disciplines they apply to (none =
 * all), order, and archive. Archive, don't delete — a category in use by a
 * requisition can only be archived (deleteSkillCategoryIfUnused refuses otherwise).
 */

function requireSuperadmin(event: RequestEvent) {
	const user = event.locals.user;
	if (!user) redirect(302, '/auth/sign-in');
	return user.role === USER_ROLES.SUPERADMIN;
}

const categoryFields = z.object({
	name: z.string().trim().min(1, 'Name is required').max(80),
	description: z.string().trim().max(300).optional().default('')
});

export const load: PageServerLoad = async (event) => {
	if (!requireSuperadmin(event)) redirect(302, '/dashboard');
	const searchTerm = event.url.searchParams.get('search') || '';
	const [categories, disciplines] = await Promise.all([
		getAllSkillCategories(searchTerm),
		getAllDisciplines()
	]);
	return { categories, disciplines, searchTerm };
};

export const actions = {
	addCategory: async (event) => {
		if (!requireSuperadmin(event)) return fail(403, { message: 'Not permitted.' });
		const fd = await event.request.formData();
		const parsed = categoryFields.safeParse({
			name: fd.get('name'),
			description: fd.get('description') ?? ''
		});
		if (!parsed.success) {
			return fail(400, { message: parsed.error.issues[0]?.message ?? 'Invalid category.' });
		}
		const disciplineIds = fd.getAll('disciplineIds').map(String).filter(Boolean);

		try {
			await createNewSkillCategory(
				{
					id: crypto.randomUUID(),
					name: parsed.data.name,
					description: parsed.data.description || null
				},
				disciplineIds
			);
		} catch (e) {
			const message = isUniqueViolation(e)
				? `A category named "${parsed.data.name}" already exists.`
				: 'Category was not able to be created.';
			if (!isUniqueViolation(e)) console.error(e);
			setFlash({ type: 'error', message }, event);
			return fail(400, { message });
		}
		setFlash({ type: 'success', message: 'Category created.' }, event);
		return { success: true };
	},

	editCategory: async (event) => {
		if (!requireSuperadmin(event)) return fail(403, { message: 'Not permitted.' });
		const fd = await event.request.formData();
		const id = String(fd.get('id') ?? '');
		const parsed = categoryFields.safeParse({
			name: fd.get('name'),
			description: fd.get('description') ?? ''
		});
		if (!id || !parsed.success) {
			return fail(400, {
				message: parsed.success ? 'Missing category.' : parsed.error.issues[0]?.message
			});
		}
		const disciplineIds = fd.getAll('disciplineIds').map(String).filter(Boolean);

		try {
			await updateSkillCategory(
				id,
				{ name: parsed.data.name, description: parsed.data.description || null },
				disciplineIds
			);
		} catch (e) {
			const message = isUniqueViolation(e)
				? `A category named "${parsed.data.name}" already exists.`
				: 'Category was not able to be updated.';
			if (!isUniqueViolation(e)) console.error(e);
			setFlash({ type: 'error', message }, event);
			return fail(400, { message });
		}
		setFlash({ type: 'success', message: 'Category updated.' }, event);
		return { success: true };
	},

	setArchived: async (event) => {
		if (!requireSuperadmin(event)) return fail(403, { message: 'Not permitted.' });
		const fd = await event.request.formData();
		const id = String(fd.get('id') ?? '');
		const archived = fd.get('archived') === 'true';
		if (!id) return fail(400, { message: 'Missing category.' });
		await updateSkillCategory(id, { archivedAt: archived ? new Date() : null });
		setFlash(
			{ type: 'success', message: archived ? 'Category archived.' : 'Category restored.' },
			event
		);
		return { success: true };
	},

	reorder: async (event) => {
		if (!requireSuperadmin(event)) return fail(403, { message: 'Not permitted.' });
		const fd = await event.request.formData();
		const orderedIds = fd.getAll('orderedIds').map(String).filter(Boolean);
		if (orderedIds.length === 0) return fail(400, { message: 'Nothing to reorder.' });
		await reorderSkillCategories(orderedIds);
		return { success: true };
	},

	deleteCategory: async (event) => {
		if (!requireSuperadmin(event)) return fail(403, { message: 'Not permitted.' });
		const fd = await event.request.formData();
		const id = String(fd.get('id') ?? '');
		if (!id) return fail(400, { message: 'Missing category.' });

		const outcome = await deleteSkillCategoryIfUnused(id);
		if (outcome === 'IN_USE') {
			const message =
				'This category still has skills or is used by a requisition. Archive it instead.';
			setFlash({ type: 'error', message }, event);
			return fail(409, { message });
		}
		setFlash({ type: 'success', message: 'Category deleted.' }, event);
		return { success: true };
	}
};
