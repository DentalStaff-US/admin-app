import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { z } from 'zod';
import { setFlash } from 'sveltekit-flash-message/server';
import {
	createNewSkill,
	deleteSkillIfUnused,
	getAllSkillCategories,
	getAllSkills,
	isUniqueViolation,
	reorderSkills,
	updateSkill
} from '$lib/server/database/queries/skills';
import { USER_ROLES } from '$lib/config/constants';

/**
 * Skills within categories. `requiresCertificate` makes holding the skill depend
 * on a linked, unexpired CERTIFICATE (e.g. CPR/BLS). Archive, don't delete — a skill
 * held by a professional or required by a requisition can only be archived.
 */

function requireSuperadmin(event: RequestEvent) {
	const user = event.locals.user;
	if (!user) redirect(302, '/auth/sign-in');
	return user.role === USER_ROLES.SUPERADMIN;
}

const skillFields = z.object({
	name: z.string().trim().min(1, 'Name is required').max(80),
	categoryId: z.string().min(1, 'Choose a category'),
	requiresCertificate: z.boolean()
});

function parseSkill(fd: FormData) {
	return skillFields.safeParse({
		name: fd.get('name'),
		categoryId: fd.get('categoryId'),
		requiresCertificate:
			fd.get('requiresCertificate') === 'on' || fd.get('requiresCertificate') === 'true'
	});
}

export const load: PageServerLoad = async (event) => {
	if (!requireSuperadmin(event)) redirect(302, '/dashboard');
	const searchTerm = event.url.searchParams.get('search') || '';
	const [skills, categories] = await Promise.all([
		getAllSkills(searchTerm),
		getAllSkillCategories()
	]);
	return { skills, categories, searchTerm };
};

export const actions = {
	addSkill: async (event) => {
		if (!requireSuperadmin(event)) return fail(403, { message: 'Not permitted.' });
		const parsed = parseSkill(await event.request.formData());
		if (!parsed.success) {
			return fail(400, { message: parsed.error.issues[0]?.message ?? 'Invalid skill.' });
		}
		try {
			await createNewSkill({ id: crypto.randomUUID(), ...parsed.data });
		} catch (e) {
			const message = isUniqueViolation(e)
				? `"${parsed.data.name}" already exists in that category.`
				: 'Skill was not able to be created.';
			if (!isUniqueViolation(e)) console.error(e);
			setFlash({ type: 'error', message }, event);
			return fail(400, { message });
		}
		setFlash({ type: 'success', message: 'Skill created.' }, event);
		return { success: true };
	},

	editSkill: async (event) => {
		if (!requireSuperadmin(event)) return fail(403, { message: 'Not permitted.' });
		const fd = await event.request.formData();
		const id = String(fd.get('id') ?? '');
		const parsed = parseSkill(fd);
		if (!id || !parsed.success) {
			return fail(400, {
				message: parsed.success ? 'Missing skill.' : parsed.error.issues[0]?.message
			});
		}
		try {
			await updateSkill(id, parsed.data);
		} catch (e) {
			const message = isUniqueViolation(e)
				? `"${parsed.data.name}" already exists in that category.`
				: 'Skill was not able to be updated.';
			if (!isUniqueViolation(e)) console.error(e);
			setFlash({ type: 'error', message }, event);
			return fail(400, { message });
		}
		setFlash({ type: 'success', message: 'Skill updated.' }, event);
		return { success: true };
	},

	setArchived: async (event) => {
		if (!requireSuperadmin(event)) return fail(403, { message: 'Not permitted.' });
		const fd = await event.request.formData();
		const id = String(fd.get('id') ?? '');
		const archived = fd.get('archived') === 'true';
		if (!id) return fail(400, { message: 'Missing skill.' });
		await updateSkill(id, { archivedAt: archived ? new Date() : null });
		setFlash({ type: 'success', message: archived ? 'Skill archived.' : 'Skill restored.' }, event);
		return { success: true };
	},

	reorder: async (event) => {
		if (!requireSuperadmin(event)) return fail(403, { message: 'Not permitted.' });
		const fd = await event.request.formData();
		const orderedIds = fd.getAll('orderedIds').map(String).filter(Boolean);
		if (orderedIds.length === 0) return fail(400, { message: 'Nothing to reorder.' });
		await reorderSkills(orderedIds);
		return { success: true };
	},

	deleteSkill: async (event) => {
		if (!requireSuperadmin(event)) return fail(403, { message: 'Not permitted.' });
		const fd = await event.request.formData();
		const id = String(fd.get('id') ?? '');
		if (!id) return fail(400, { message: 'Missing skill.' });

		const outcome = await deleteSkillIfUnused(id);
		if (outcome === 'IN_USE') {
			const message =
				'This skill is held by a professional, required by a requisition, or has a linked certificate. Archive it instead.';
			setFlash({ type: 'error', message }, event);
			return fail(409, { message });
		}
		setFlash({ type: 'success', message: 'Skill deleted.' }, event);
		return { success: true };
	}
};
