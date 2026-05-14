import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { authenticateUser } from '$lib/server/serverUtils';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { timeSheetTable } from '$lib/server/database/schemas/requisition';
import db from '$lib/server/database/drizzle';
import { getCandidateProfileByUserId } from '$lib/server/database/queries/candidates';
import {
	createTimesheetExpense,
	listTimesheetExpenses
} from '$lib/server/database/queries/requisitions';

const corsHeaders = {
	'Access-Control-Allow-Origin': env.CANDIDATE_APP_DOMAIN,
	'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization',
	'Access-Control-Allow-Credentials': 'true'
};

export const OPTIONS: RequestHandler = async () =>
	new Response(null, { headers: corsHeaders });

type AuthResult =
	| {
			ok: true;
			user: { id: string };
			candidateProfile: { id: string };
			timesheet: typeof timeSheetTable.$inferSelect;
	  }
	| { ok: false; status: number; message: string };

async function authenticateOwningCandidate(
	request: Request,
	timesheetId: string
): Promise<AuthResult> {
	const user = await authenticateUser(request);
	if (!user) return { ok: false, status: 401, message: 'Unauthorized' };

	const candidateProfile = await getCandidateProfileByUserId(user.id);
	if (!candidateProfile) {
		return { ok: false, status: 404, message: 'Candidate profile not found' };
	}

	const [timesheet] = await db
		.select()
		.from(timeSheetTable)
		.where(
			and(
				eq(timeSheetTable.id, timesheetId),
				eq(timeSheetTable.associatedCandidateId, candidateProfile.id)
			)
		)
		.limit(1);

	if (!timesheet) {
		return { ok: false, status: 404, message: 'Timesheet not found' };
	}
	return { ok: true, user, candidateProfile, timesheet };
}

export const GET: RequestHandler = async ({ request, params }) => {
	try {
		const { id } = params;
		if (!id) {
			return json(
				{ success: false, message: 'Timesheet id required' },
				{ status: 400, headers: corsHeaders }
			);
		}

		const auth = await authenticateOwningCandidate(request, id);
		if (!auth.ok) {
			return json(
				{ success: false, message: auth.message },
				{ status: auth.status, headers: corsHeaders }
			);
		}

		const expenses = await listTimesheetExpenses(id);
		return json({ success: true, data: { expenses } }, { headers: corsHeaders });
	} catch (err) {
		console.error('GET /api/external/timesheets/[id]/expenses error:', err);
		return json(
			{ success: false, message: 'Internal server error' },
			{ status: 500, headers: corsHeaders }
		);
	}
};

const createExpenseSchema = z.object({
	description: z.string().min(1).max(500),
	amountCents: z.number().int().positive()
});

export const POST: RequestHandler = async ({ request, params }) => {
	try {
		const contentType = request.headers.get('content-type');
		if (!contentType?.includes('application/json')) {
			return json(
				{ success: false, message: 'Content-Type must be application/json' },
				{ status: 400, headers: corsHeaders }
			);
		}

		const { id } = params;
		if (!id) {
			return json(
				{ success: false, message: 'Timesheet id required' },
				{ status: 400, headers: corsHeaders }
			);
		}

		const auth = await authenticateOwningCandidate(request, id);
		if (!auth.ok) {
			return json(
				{ success: false, message: auth.message },
				{ status: auth.status, headers: corsHeaders }
			);
		}
		const { user, candidateProfile, timesheet } = auth;

		if (timesheet.status === 'APPROVED' || timesheet.status === 'VOID') {
			return json(
				{ success: false, message: 'Cannot add expenses to an approved or voided timesheet' },
				{ status: 400, headers: corsHeaders }
			);
		}

		const body = await request.json().catch(() => null);
		const parsed = createExpenseSchema.safeParse(body);
		if (!parsed.success) {
			return json(
				{ success: false, message: parsed.error.errors[0].message },
				{ status: 400, headers: corsHeaders }
			);
		}

		const expense = await createTimesheetExpense(
			{
				timesheetId: id,
				candidateId: candidateProfile.id,
				description: parsed.data.description,
				amountCents: parsed.data.amountCents,
				createdByUserId: user.id
			},
			user.id
		);

		return json({ success: true, data: { expense } }, { headers: corsHeaders });
	} catch (err) {
		console.error('POST /api/external/timesheets/[id]/expenses error:', err);
		if (err instanceof Error && 'status' in err && 'body' in err) {
			return json(
				{ success: false, message: (err as any).body.message },
				{ status: (err as any).status, headers: corsHeaders }
			);
		}
		return json(
			{ success: false, message: 'Internal server error' },
			{ status: 500, headers: corsHeaders }
		);
	}
};
