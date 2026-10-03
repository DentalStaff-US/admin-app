import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, RequestEvent } from './$types';
import { setFlash } from 'sveltekit-flash-message/server';
import { USER_ROLES } from '$lib/config/constants';
import { disciplineTable } from '$lib/server/database/schemas/skill';
import db from '$lib/server/database/drizzle';
import { candidateDocumentUploadsTable } from '$lib/server/database/schemas/candidate';
import { candidateProfileTable } from '$lib/server/database/schemas/candidate';
import { eq, ilike, or, desc } from 'drizzle-orm';
import { z } from 'zod';
import { superValidate, message, setError } from 'sveltekit-superforms/server';
import { userTable } from '$lib/server/database/schemas/auth';

export const load: PageServerLoad = async (event) => {
	const searchTerm = event.url.searchParams.get('search') || '';
	const user = event.locals.user;

	if (!user) {
		redirect(302, '/auth/sign-in');
	}

	if (user && user.role !== USER_ROLES.SUPERADMIN) {
		redirect(302, '/dashboard');
	}

	try {
		// Fetch all documents with candidate information
		const documents = await db
			.select({
				id: candidateDocumentUploadsTable.id,
				createdAt: candidateDocumentUploadsTable.createdAt,
				updatedAt: candidateDocumentUploadsTable.updatedAt,
				uploadUrl: candidateDocumentUploadsTable.uploadUrl,
				expiryDate: candidateDocumentUploadsTable.expiryDate,
				type: candidateDocumentUploadsTable.type,
				filename: candidateDocumentUploadsTable.filename,
				candidateId: candidateDocumentUploadsTable.candidateId,
				candidateFirstName: userTable.firstName,
				candidateLastName: userTable.lastName,
				// Which Experience & Rates entry this credential evidences, if any.
				disciplineId: candidateDocumentUploadsTable.disciplineId,
				disciplineName: disciplineTable.name,
				disciplineAbbreviation: disciplineTable.abbreviation,
				// The admin-set requirement, so an expiry on a discipline that needs no
				// credential is not shown as though it gates anything.
				requiresCertification: disciplineTable.requiresCertification
			})
			.from(candidateDocumentUploadsTable)
			.leftJoin(
				disciplineTable,
				eq(disciplineTable.id, candidateDocumentUploadsTable.disciplineId)
			)
			.leftJoin(
				candidateProfileTable,
				eq(candidateDocumentUploadsTable.candidateId, candidateProfileTable.id)
			)
			.innerJoin(userTable, eq(candidateProfileTable.userId, userTable.id))
			.where(
				searchTerm
					? or(
							ilike(candidateDocumentUploadsTable.filename, `%${searchTerm}%`),
							ilike(userTable.firstName, `%${searchTerm}%`),
							ilike(userTable.lastName, `%${searchTerm}%`)
						)
					: undefined
			)
			.orderBy(desc(candidateDocumentUploadsTable.createdAt));

		return {
			documents: documents || []
		};
	} catch (e) {
		console.error('Error loading documents:', e);
		return {
			documents: []
		};
	}
};

export const actions = {
	deleteDocument: async (event: RequestEvent) => {
		const user = event.locals.user;

		if (!user) {
			redirect(302, '/auth/sign-in');
		}

		if (user.role !== USER_ROLES.SUPERADMIN) {
			return fail(403, { message: 'You do not have permission to delete documents.' });
		}

		const form = await superValidate(event, z.object({ id: z.string().uuid() }));

		if (!form.valid) {
			return fail(400, {
				form
			});
		}

		const documentId = form.data.id;

		if (!documentId) {
			return fail(400, { message: 'Document ID is required.' });
		}

		try {
			await db
				.delete(candidateDocumentUploadsTable)
				.where(eq(candidateDocumentUploadsTable.id, documentId));

			setFlash(
				{
					type: 'success',
					message: 'Document deleted successfully.'
				},
				event
			);
		} catch (e) {
			console.error(e);
			setFlash({ type: 'error', message: 'Document was not able to be deleted.' }, event);
			return setError(form, 'Error deleting document.');
		}

		console.log('Document deleted successfully');
		return message(form, 'Document deleted successfully.');
	}
};
