import { candidateDocumentUploadsTable } from './../../../../lib/server/database/schemas/candidate';
import { syncAffiliateEligibility } from '$lib/server/database/queries/affiliates';
import type { PageServerLoad } from './$types';
import {
	getAllCandidateWorkHistory,
	getCandidateDocuments,
	getCandidateProfileById,
	getCandidateUserById,
	updateCandidateProfile,
	uploadCandidateDocuments
} from '$lib/server/database/queries/candidates';
import { fail, redirect } from '@sveltejs/kit';
import { CANDIDATE_STATUS, USER_ROLES, type CandidateStatus } from '$lib/config/constants';
import { getSupportTicketsForUser } from '$lib/server/database/queries/support';
import { z } from 'zod';
import { message, setError, superValidate } from 'sveltekit-superforms/server';
import type { RequestEvent } from './$types';
import { setFlash } from 'sveltekit-flash-message/server';
import {
	toCredentialExpiryDate,
	validateCredentialLink
} from '$lib/server/certifications/credentialLink';
import {
	getCandidateDisciplineSnapshot,
	replaceCandidateDisciplines
} from '$lib/server/database/queries/candidateDisciplines';
import { setDisciplineCertification } from '$lib/server/certifications/setDisciplineCertification';
import { recordAction } from '$lib/server/audit/audit';
import {
	getCandidateAvailability,
	saveCandidateAvailability
} from '$lib/server/availability/queries';
import { todayInET } from '$lib/server/certifications/credentialStatus';
import {
	CandidateStatusSchema,
	updateCandidateProfileSchema,
	updateCandidateDisciplinesSchema,
	documentUrlSchema
} from '$lib/config/zod-schemas';
import { getUserById, updateUser } from '$lib/server/database/queries/users';
import db from '$lib/server/database/drizzle';
import { buildCandidateAddressPatch } from '$lib/server/address';
import { geocodingQueue } from '$lib/server/geocode-queue';
import { candidateDisciplineExperienceTable } from '$lib/server/database/schemas/candidate';
import { disciplineTable, experienceLevelTable } from '$lib/server/database/schemas/skill';
import { eq } from 'drizzle-orm';
import {
	addComment,
	deleteComment,
	getCommentsForCandidate
} from '$lib/server/database/queries/admin';

export const load: PageServerLoad = async (event) => {
	const user = event.locals.user;
	if (!user) {
		redirect(302, '/auth/sign-in');
	}

	const { id } = event.params;
	const statusForm = await superValidate(event, CandidateStatusSchema);
	const personalDetailsForm = await superValidate(event, updateCandidateProfileSchema);
	const candidateResult = await getCandidateProfileById(id);
	const disciplinesForm = await superValidate(
		{
			disciplines:
				candidateResult.disciplines?.map((d) => ({
					disciplineId: d.discipline.id,
					experienceLevelId: d.experience.experienceLevelId,
					preferredHourlyMin: d.salaryRange.min,
					preferredHourlyMax: d.salaryRange.max
				})) || []
		},
		updateCandidateDisciplinesSchema
	);
	const documentsForm = await superValidate(event, documentUrlSchema);

	// A year ahead on first paint. NOT a cap on how far ahead a day can be blocked —
	// each save declares its own window — just the initial read.
	const availabilityFrom = todayInET();
	const availabilityTo = `${Number(availabilityFrom.slice(0, 4)) + 1}${availabilityFrom.slice(4)}`;
	const availability = await getCandidateAvailability(id, {
		from: availabilityFrom,
		to: availabilityTo,
		includeBooked: true
	});

	const supportTickets = await getSupportTicketsForUser(candidateResult.candidate.user.id);
	const workHistory = await getAllCandidateWorkHistory(id);
	const documents = await getCandidateDocuments(id);
	const comments = await getCommentsForCandidate(id);

	// Fetch all available disciplines for the dropdown
	const allDisciplinesData = await db.select().from(disciplineTable);

	// Fetch all experience levels
	const experienceLevels = await db.select().from(experienceLevelTable);

	return candidateResult
		? {
				user,
				candidate: {
					profile: candidateResult.candidate.profile,
					user: candidateResult.candidate.user
				},
				allDisciplines: candidateResult.disciplines || [],
				availableDisciplines: allDisciplinesData,
				experienceLevels,
				supportTickets,
				workHistory,
				documents,
				statusForm,
				personalDetailsForm,
				disciplinesForm,
				comments,
				availability,
				availabilityWindow: { from: availabilityFrom, to: availabilityTo }
			}
		: {
				user,
				candidate: null,
				allDisciplines: [],
				availableDisciplines: [],
				experienceLevels: [],
				supportTickets: [],
				workHistory: [],
				documents: [],
				statusForm,
				personalDetailsForm,
				disciplinesForm,
				comments: [],
				availability,
				availabilityWindow: { from: availabilityFrom, to: availabilityTo }
			};
};

export const actions = {
	/**
	 * Staff setting a professional's availability, typically from a phone call.
	 *
	 * Two switches the professional's own door never gets, mirroring
	 * setDisciplineCertification's allowPastDate/allowDisable: an admin may record a
	 * past absence, and an admin may mark a day off that the professional is already
	 * booked on ("she's out sick Thursday" is how a cancellation begins — refusing it
	 * would force staff to cancel first and lose the note).
	 *
	 * This feature NEVER mutates shift state. Blacking out a booked day does not
	 * cancel the workday; that still goes through the cancel paths, which keep the
	 * recurrence_day_cancellations ledger and notify the client.
	 */
	updateAvailability: async ({ request, locals, params }) => {
		const { id } = params;
		const user = locals.user;
		if (!user) return fail(403);

		// A professional's days off are schedule-privacy data, so this is SUPERADMIN
		// only — the same gate as the rest of this page's write actions and the same
		// gate as the Work History tab.
		if (user.role !== USER_ROLES.SUPERADMIN) {
			return fail(403, { message: "You do not have permission to update a professional's availability" });
		}

		const fd = await request.formData();
		let availableDays: number[] | null = null;
		let blockedDates: string[] = [];
		try {
			const rawDays = fd.get('availableDays');
			const rawDates = fd.get('blockedDates');
			availableDays = rawDays ? JSON.parse(String(rawDays)) : null;
			blockedDates = rawDates ? JSON.parse(String(rawDates)) : [];
		} catch {
			return fail(400, { message: 'Could not read the availability selection.' });
		}

		const from = String(fd.get('replaceFrom') ?? todayInET());
		const to = String(fd.get('replaceTo') ?? '');
		if (!to) return fail(400, { message: 'Missing the window being saved.' });

		const result = await saveCandidateAvailability({
			candidateId: id,
			availableDays,
			blackouts: { from, to, dates: blockedDates },
			source: 'ADMIN',
			actor: user,
			allowPastDate: true
		});

		if (!result.ok) {
			return fail(result.reason === 'ERROR' ? 500 : 400, { message: result.message });
		}

		// The professional IS told that a third party changed what work they are shown:
		// saveCandidateAvailability stamps available_days_source = 'ADMIN', and the
		// candidate app's Settings -> Availability page renders an attribution banner
		// off that (COPY.adminBanner), alongside the full action_history entry.
		//
		// Deliberately NOT routed through src/lib/server/notifications/
		// inAppNotificationService: that class is never instantiated and nothing reads
		// in_app_notifications, so a write there would be a notification in name only —
		// worse than none, because this code would claim the professional had been told.
		// A push channel (email) for admin-made availability changes is a worthwhile
		// follow-up; it needs a real template rather than a write into a dead table.
		return { success: true, availability: result };
	},

	updatePersonalDetails: async ({ request, locals, params }) => {
		console.log('Update personal details action called');
		const { id } = params;

		const user = locals.user;
		if (!user) {
			return fail(403);
		}

		if (user.role !== USER_ROLES.SUPERADMIN) {
			return fail(403, { message: "You do not have permission to update a user's details" });
		}

		const form = await superValidate(request, updateCandidateProfileSchema);

		if (!form.valid) {
			console.log('Form validation failed:', form.errors);
			return fail(400, { form });
		}
		console.log('Form data:', form.data);
		const { email, lastName, firstName, birthday, cellPhone, workersCompCode, workPreference } =
			form.data;

		try {
			const candidateResult = await getCandidateProfileById(id);
			const userData = {
				updatedAt: new Date(),
				email,
				firstName,
				lastName
			};

			// Build the profile patch field-by-field so blanks are SKIPPED rather
			// than written as null. The admin's address autocomplete starts blank
			// (it can't be prefilled without freezing the input — see svelte file
			// comment), so a save without re-selecting an address must NOT wipe
			// the existing address. Only fields the admin actually typed/picked
			// land in the update.
			const profileData: Record<string, unknown> = { updatedAt: new Date() };
			if (birthday !== undefined) profileData.birthday = birthday ?? null;
			if (cellPhone !== undefined) profileData.cellPhone = cellPhone || null;
			if (workersCompCode !== undefined) profileData.workersCompCode = workersCompCode || null;
			// Temp / permanent / both. Stamped only when submitted, so an unrelated
			// save doesn't claim the professional answered the question — and stamped
			// even on null, because a reset to the default is still an answer.
			if (workPreference !== undefined) {
				profileData.workPreference = workPreference ?? null;
				profileData.workPreferenceUpdatedAt = new Date();
			}
			const addr = form.data.completeAddress;
			let queueGeocode = false;
			if (addr && addr !== 'undefined') {
				profileData.completeAddress = addr;
				if (form.data.lat && form.data.lat !== 'undefined') {
					profileData.lat = parseFloat(form.data.lat).toString();
				}
				if (form.data.lon && form.data.lon !== 'undefined') {
					profileData.lon = parseFloat(form.data.lon).toString();
				}

				// Keep the granular columns in step with the address that was just
				// picked. All four are written together so a changed address can't
				// leave a stale city/state behind.
				const resolved = buildCandidateAddressPatch(form.data);
				Object.assign(profileData, resolved.patch);
				queueGeocode = resolved.needsGeocode;
			}
			await updateUser(candidateResult.candidate.user.id, userData);
			await updateCandidateProfile(id, profileData);

			// Free-typed address the picker couldn't break down — let the geocoder
			// fill in the components in the background.
			if (queueGeocode && addr) {
				geocodingQueue.addJobs([
					{ candidateId: id, address: addr, email: email ?? '', type: 'candidate' }
				]);
			}

			return message(form, 'Personal details updated successfully');
		} catch (e) {
			console.error(e);
			return setError(form, 'Failed to update personal details');
		}
	},

	updateDisciplines: async (event) => {
		const { id } = event.params;
		const user = event.locals.user;

		if (!user) {
			return fail(403);
		}

		if (user.role !== USER_ROLES.SUPERADMIN) {
			return fail(403, { message: 'You do not have permission to update disciplines' });
		}

		const form = await superValidate(event, updateCandidateDisciplinesSchema);

		if (!form.valid) {
			console.log('Form validation failed:', form.errors);
			return fail(400, { form });
		}

		try {
			const { disciplines } = form.data;

			// Was a delete-all followed by an untransacted insert loop: a failure part
			// way through left the professional with a partial or empty discipline set,
			// which removes them from the matching engine and every job list.
			await db.transaction(async (tx) => {
				const before = await getCandidateDisciplineSnapshot(id, tx);

				await replaceCandidateDisciplines(id, disciplines, tx);

				// This file had no audit trail at all. Disciplines drive job matching and
				// pay, so a change here is worth the same record as a status change.
				await recordAction({
					entityType: 'CANDIDATES',
					entityId: id,
					action: 'UPDATE',
					actor: user,
					before: { disciplines: before },
					after: { disciplines },
					metadata: { field: 'disciplines' },
					tx
				});
			});

			setFlash(
				{
					type: 'success',
					message: 'Disciplines updated successfully'
				},
				event
			);

			return message(form, 'Disciplines updated successfully');
		} catch (error) {
			console.error('Error updating disciplines:', error);
			setFlash(
				{
					type: 'error',
					message: 'Failed to update disciplines'
				},
				event
			);
			return setError(form, 'Failed to update disciplines');
		}
	},

	/**
	 * Admin edit of ONE Experience & Rates row's certification.
	 *
	 * Deliberately NOT part of updateDisciplines. That action is a delete-and-upsert
	 * over the whole set whose `set` clause omits the cert columns on purpose, so a
	 * rate edit can never clear a certification — which also means it can never be
	 * the thing that clears one intentionally. Worse, re-adding a discipline in the
	 * same save keeps it in the keep-list, skips the delete, and the upsert leaves a
	 * stale declaration in place: the "I deleted the row and the 2028 date came back"
	 * report. This single-row door is the only way to change it, in either direction.
	 *
	 * Admins get both switches a professional does not: they may turn tracking OFF
	 * and may record a date already in the past, because a lapsed certification is a
	 * fact worth recording honestly.
	 */
	updateDisciplineCertification: async (event: RequestEvent) => {
		const { id } = event.params;
		const user = event.locals.user;

		if (!user) return fail(403);
		if (user.role !== USER_ROLES.SUPERADMIN) {
			return fail(403, { message: 'You do not have permission to update certifications' });
		}

		const data = await event.request.formData();
		const parsed = z
			.object({
				disciplineId: z.string().min(1),
				requiresCert: z.coerce.boolean(),
				// '' means "no date" — distinct from the field being absent, which this
				// form never does. Normalised to null below.
				certExpiresOn: z
					.string()
					.regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Enter a valid date.')
					.optional()
			})
			.safeParse({
				disciplineId: data.get('disciplineId'),
				requiresCert: data.get('requiresCert') === 'true',
				certExpiresOn: data.get('certExpiresOn') ?? ''
			});

		if (!parsed.success) {
			setFlash({ type: 'error', message: 'Enter a valid expiration date.' }, event);
			return fail(400, { message: 'Invalid certification payload' });
		}

		const result = await setDisciplineCertification({
			candidateId: id,
			disciplineId: parsed.data.disciplineId,
			requiresCert: parsed.data.requiresCert,
			certExpiresOn: parsed.data.certExpiresOn ? parsed.data.certExpiresOn : null,
			allowDisable: true,
			allowPastDate: true,
			actor: user
		});

		if (!result.ok) {
			// NO_CHANGE is not an error worth alarming anyone about — the admin saved a
			// form they did not actually change.
			setFlash(
				{ type: result.reason === 'NO_CHANGE' ? 'success' : 'error', message: result.message },
				event
			);
			return result.reason === 'NO_CHANGE' ? { success: true } : fail(400, { message: result.message });
		}

		setFlash({ type: 'success', message: 'Certification updated' }, event);
		return { success: true };
	},

	updateStatus: async (event: RequestEvent) => {
		const user = event.locals.user;
		if (!user) {
			return fail(403);
		}

		if (user.role !== USER_ROLES.SUPERADMIN) {
			return fail(403, { message: 'You do not have permission to update status' });
		}
		const form = await superValidate(event, CandidateStatusSchema);
		const { id } = event.params;
		const { status } = form.data;

		if (!(status in CANDIDATE_STATUS)) {
			return setError(form, `Invalid status: ${status}`);
		}

		try {
			const profile = await getCandidateProfileById(id);
			const user = profile.candidate.user;
			const isActive = status === CANDIDATE_STATUS.ACTIVE;
			const newValues = {
				updatedAt: new Date(),
				status: status as CandidateStatus,
				approved: isActive
			};

			await updateUser(user.id, { completedOnboarding: isActive });

			await updateCandidateProfile(id, newValues);

			// Affiliate participation is derived from this status: leaving ACTIVE puts
			// the affiliate ON_HOLD (no link, no new accrual — already-earned balance
			// still pays out), and returning to ACTIVE reinstates it. No-ops when the
			// user is not an affiliate.
			await syncAffiliateEligibility(user.id);

			setFlash(
				{
					type: 'success',
					message: 'Candidate status updated successfully'
				},
				event
			);
			return message(form, 'Status Updated');
		} catch (error) {
			console.error('Error updating candidate status:', error);
			setFlash(
				{
					type: 'error',
					message: 'Failed to update candidate status'
				},
				event
			);
			return setError(form, 'Something went wrong');
		}
	},
	documentsUpload: async (event) => {
		const { locals, request } = event;
		const { user } = locals;

		if (!user) {
			return redirect(302, '/sign-in');
		}

		const candidateId = event.params.id;

		const form = await superValidate(request, documentUrlSchema);

		if (!form.valid) {
			return fail(400, { form });
		}

		const fileData = form.data.filesData;

		try {
			// Admins may file a document as the credential for a discipline. Validate the
			// link against the professional's Experience & Rates entries first — the same
			// rule the external endpoints enforce, so a stray link cannot be created here.
			const disciplineId = form.data.documentDisciplineId || null;
			const expiryDate = toCredentialExpiryDate(form.data.documentExpiryDate || null);
			const type = form.data.documentType ?? form.data.type ?? 'OTHER';

			if (disciplineId) {
				const decision = await validateCredentialLink({
					candidateId,
					disciplineId,
					type,
					expiryDate
				});
				if (!decision.ok) {
					setFlash({ type: 'error', message: decision.message }, event);
					return setError(form, decision.message);
				}
			}

			await uploadCandidateDocuments(fileData, candidateId, { type, disciplineId, expiryDate });

			setFlash({ type: 'success', message: 'Documents uploaded successfully' }, event);
			return message(
				{
					...form,
					data: {
						urls: undefined,
						filesData: undefined,
						url: undefined
					}
				},
				'Documents uploaded successfully'
			);
		} catch (err) {
			console.error(err);
			setFlash({ type: 'error', message: 'Failed to upload documents' }, event);
			return setError(form, 'Failed to upload documents');
		}
	},
	/**
	 * Set (or clear) the credential link and expiry on an existing document.
	 *
	 * Admins are not subject to the approval freeze that governs candidate-initiated
	 * edits, so this writes directly rather than going through
	 * `assertCandidateDocumentEditable` — matching how every other admin action on this
	 * page behaves. The credential-link rules are still enforced.
	 */
	updateDocumentCredential: async (event: RequestEvent) => {
		const user = event.locals.user;
		if (!user || user.role !== USER_ROLES.SUPERADMIN) return fail(403);

		const candidateId = event.params.id as string;
		const fd = await event.request.formData();
		const documentId = String(fd.get('documentId') ?? '');
		const rawDiscipline = fd.get('disciplineId');
		const rawExpiry = fd.get('expiryDate');
		const rawType = fd.get('type');

		if (!documentId) return fail(400, { message: 'Missing document.' });

		const [existing] = await db
			.select({
				type: candidateDocumentUploadsTable.type,
				expiryDate: candidateDocumentUploadsTable.expiryDate,
				disciplineId: candidateDocumentUploadsTable.disciplineId
			})
			.from(candidateDocumentUploadsTable)
			.where(eq(candidateDocumentUploadsTable.id, documentId));

		if (!existing) return fail(404, { message: 'Document not found.' });

		const patch: Record<string, unknown> = { updatedAt: new Date() };
		if (rawType !== null) patch.type = String(rawType);
		if (rawDiscipline !== null) patch.disciplineId = rawDiscipline === '' ? null : String(rawDiscipline);
		if (rawExpiry !== null) {
			patch.expiryDate = rawExpiry === '' ? null : toCredentialExpiryDate(String(rawExpiry));
		}

		const nextType = (patch.type ?? existing.type) as string;
		const nextDisciplineId = (
			'disciplineId' in patch ? patch.disciplineId : existing.disciplineId
		) as string | null;
		const nextExpiry = ('expiryDate' in patch ? patch.expiryDate : existing.expiryDate) as Date | null;

		const decision = await validateCredentialLink({
			candidateId,
			disciplineId: nextDisciplineId,
			type: nextType,
			expiryDate: nextExpiry
		});
		if (!decision.ok) {
			setFlash({ type: 'error', message: decision.message }, event);
			return fail(400, { message: decision.message });
		}

		await db
			.update(candidateDocumentUploadsTable)
			.set(patch)
			.where(eq(candidateDocumentUploadsTable.id, documentId));

		setFlash({ type: 'success', message: 'Document updated.' }, event);
		return { success: true };
	},

	deleteDocument: async (event: RequestEvent) => {
		const user = event.locals.user;
		if (!user || user.role !== USER_ROLES.SUPERADMIN) return fail(403);

		const formData = await event.request.formData();
		const documentId = formData.get('documentId') as string;

		try {
			await db
				.delete(candidateDocumentUploadsTable)
				.where(eq(candidateDocumentUploadsTable.id, documentId));
			setFlash({ type: 'success', message: 'Document deleted successfully' }, event);
			return { success: true };
		} catch (err) {
			console.error(err);
			setFlash({ type: 'error', message: 'Failed to delete document' }, event);
			return fail(500, { error: 'Failed to delete document' });
		}
	},
	toggleAdminDocumentLock: async (event: RequestEvent) => {
		const user = event.locals.user;
		if (!user || user.role !== USER_ROLES.SUPERADMIN) return fail(403);

		const formData = await event.request.formData();
		const documentId = formData.get('documentId') as string;

		try {
			const [document] = await db
				.select()
				.from(candidateDocumentUploadsTable)
				.where(eq(candidateDocumentUploadsTable.id, documentId));
			const isLocked = document.adminOnly;
			await db
				.update(candidateDocumentUploadsTable)
				.set({ adminOnly: !isLocked, updatedAt: new Date() })
				.where(eq(candidateDocumentUploadsTable.id, documentId));
			setFlash(
				{
					type: 'success',
					message: `Document ${isLocked ? 'locked' : 'unlocked'} successfully`
				},
				event
			);
			return { success: true };
		} catch (err) {
			console.error(err);
			setFlash({ type: 'error', message: 'Failed to update document lock status' }, event);
			return fail(500, { error: 'Failed to update document lock status' });
		}
	},
	addComment: async (event: RequestEvent) => {
		const user = event.locals.user;
		if (!user || user.role !== USER_ROLES.SUPERADMIN) return fail(403);

		const { id } = event.params;
		const formData = await event.request.formData();
		const body = formData.get('body') as string;

		if (!body?.trim()) return fail(400, { error: 'Comment cannot be empty' });

		await addComment({ body: body.trim(), authorId: user.id, candidateId: id });
		setFlash({ type: 'success', message: 'Comment added' }, event);
		return { success: true };
	},

	deleteComment: async (event: RequestEvent) => {
		const user = event.locals.user;
		if (!user || user.role !== USER_ROLES.SUPERADMIN) return fail(403);

		const formData = await event.request.formData();
		const commentId = formData.get('commentId') as string;

		await deleteComment(commentId, user.id);
		setFlash({ type: 'success', message: 'Comment deleted' }, event);
		return { success: true };
	}
};
