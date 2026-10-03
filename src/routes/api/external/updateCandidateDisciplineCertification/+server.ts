import { json, type RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import db from '$lib/server/database/drizzle';
import { candidateProfileTable } from '$lib/server/database/schemas/candidate';
import { authenticateUser } from '$lib/server/serverUtils';
import { setDisciplineCertification } from '$lib/server/certifications/setDisciplineCertification';
import { logger } from '$lib/server/logger';

const corsHeaders = {
	'Access-Control-Allow-Origin': env.CANDIDATE_APP_DOMAIN ?? '',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

export const OPTIONS: RequestHandler = async () => new Response(null, { headers: corsHeaders });

const payloadSchema = z
	.object({
		disciplineId: z.string().min(1),
		/**
		 * ON only. `z.literal(true)` rather than `z.boolean()` so an attempt to turn
		 * tracking off is a visible 400 in the logs rather than a value quietly
		 * coerced away. Only an admin may disable it.
		 */
		requiresCert: z.literal(true).optional(),
		certExpiresOn: z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/)
			.optional(),
		/** The CERTIFICATE row evidencing this date, when the UI has one. */
		documentId: z.string().uuid().optional()
	})
	.strict()
	.refine((d) => d.requiresCert !== undefined || d.certExpiresOn !== undefined, {
		message: 'Nothing to change.'
	});

/**
 * Set the certification requirement and expiry for ONE of a professional's
 * Experience & Rates entries.
 *
 * WHY THIS HAS NO APPROVAL GUARD, unlike updateCandidateExperience
 * ---------------------------------------------------------------
 * Approved professionals cannot edit their disciplines, levels or rates — but a
 * certification now lives on that same row, so the people most likely to need a
 * renewal would otherwise be the only ones unable to perform it.
 *
 * Safety here comes from surface area rather than from a status check: two columns,
 * one row, one direction. It cannot create an entry (the row must already exist), it
 * cannot turn tracking off, it cannot back-date, and every call writes an
 * action_history row. That is the same argument candidateDocumentGuards.ts makes for
 * its carve-outs, and it is why this could not simply be a relaxed
 * updateCandidateExperience.
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const user = await authenticateUser(request);
		if (!user) {
			return json(
				{ success: false, message: 'Unauthorized' },
				{ status: 401, headers: corsHeaders }
			);
		}

		const body = await request.json().catch(() => null);
		const parsed = payloadSchema.safeParse(body);
		if (!parsed.success) {
			return json(
				{ success: false, message: 'Invalid request', errors: parsed.error.flatten() },
				{ status: 400, headers: corsHeaders }
			);
		}

		const [candidateProfile] = await db
			.select({ id: candidateProfileTable.id })
			.from(candidateProfileTable)
			.where(eq(candidateProfileTable.userId, user.id))
			.limit(1);

		if (!candidateProfile) {
			return json(
				{ success: false, message: 'Candidate profile not found' },
				{ status: 404, headers: corsHeaders }
			);
		}

		const result = await setDisciplineCertification({
			candidateId: candidateProfile.id,
			disciplineId: parsed.data.disciplineId,
			requiresCert: parsed.data.requiresCert,
			certExpiresOn: parsed.data.certExpiresOn,
			documentId: parsed.data.documentId ?? null,
			// Both false: this is the professional's own path.
			allowDisable: false,
			allowPastDate: false,
			actor: user
		});

		if (!result.ok) {
			const status = result.reason === 'NOT_HELD' ? 404 : 400;
			return json(
				{ success: false, reason: result.reason, message: result.message },
				{ status, headers: corsHeaders }
			);
		}

		return json({ success: true }, { status: 200, headers: corsHeaders });
	} catch (err) {
		logger.error('updateCandidateDisciplineCertification failed', { error: err });
		return json(
			{ success: false, message: 'An unexpected error occurred' },
			{ status: 500, headers: corsHeaders }
		);
	}
};
