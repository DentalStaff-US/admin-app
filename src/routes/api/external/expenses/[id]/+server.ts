import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { authenticateUser } from '$lib/server/serverUtils';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { getCandidateProfileByUserId } from '$lib/server/database/queries/candidates';
import {
	deleteTimesheetExpense,
	getTimesheetExpenseById,
	updateTimesheetExpense
} from '$lib/server/database/queries/requisitions';
import { logger } from '$lib/server/logger';

const corsHeaders = {
	'Access-Control-Allow-Origin': env.CANDIDATE_APP_DOMAIN,
	'Access-Control-Allow-Methods': 'PATCH, DELETE, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization',
	'Access-Control-Allow-Credentials': 'true'
};

export const OPTIONS: RequestHandler = async () =>
	new Response(null, { headers: corsHeaders });

type AuthorizeResult =
	| { ok: true; user: { id: string }; expense: NonNullable<Awaited<ReturnType<typeof getTimesheetExpenseById>>> }
	| { ok: false; status: number; message: string };

async function authorizeOwner(request: Request, expenseId: string): Promise<AuthorizeResult> {
	const user = await authenticateUser(request);
	if (!user) return { ok: false, status: 401, message: 'Unauthorized' };

	const expense = await getTimesheetExpenseById(expenseId);
	if (!expense) return { ok: false, status: 404, message: 'Expense not found' };

	const candidateProfile = await getCandidateProfileByUserId(user.id);
	if (!candidateProfile || candidateProfile.id !== expense.candidateId) {
		return { ok: false, status: 403, message: 'Forbidden' };
	}
	return { ok: true, user, expense };
}

const updateExpenseSchema = z.object({
	description: z.string().min(1).max(500).optional(),
	amountCents: z.number().int().positive().optional()
});

export const PATCH: RequestHandler = async ({ request, params }) => {
	try {
		const { id } = params;
		if (!id) {
			return json(
				{ success: false, message: 'Expense id required' },
				{ status: 400, headers: corsHeaders }
			);
		}

		const auth = await authorizeOwner(request, id);
		if (!auth.ok) {
			return json(
				{ success: false, message: auth.message },
				{ status: auth.status, headers: corsHeaders }
			);
		}

		const body = await request.json().catch(() => null);
		const parsed = updateExpenseSchema.safeParse(body);
		if (!parsed.success) {
			return json(
				{ success: false, message: parsed.error.errors[0].message },
				{ status: 400, headers: corsHeaders }
			);
		}

		const expense = await updateTimesheetExpense(id, parsed.data, auth.user.id);
		return json({ success: true, data: { expense } }, { headers: corsHeaders });
	} catch (err) {
		if (err instanceof Error && 'status' in err && 'body' in err) {
			return json(
				{ success: false, message: (err as any).body.message },
				{ status: (err as any).status, headers: corsHeaders }
			);
		}
		logger.error('expenses.PATCH failed', { error: err, expenseId: params.id });
		return json(
			{ success: false, message: 'Internal server error' },
			{ status: 500, headers: corsHeaders }
		);
	}
};

export const DELETE: RequestHandler = async ({ request, params }) => {
	try {
		const { id } = params;
		if (!id) {
			return json(
				{ success: false, message: 'Expense id required' },
				{ status: 400, headers: corsHeaders }
			);
		}

		const auth = await authorizeOwner(request, id);
		if (!auth.ok) {
			return json(
				{ success: false, message: auth.message },
				{ status: auth.status, headers: corsHeaders }
			);
		}

		await deleteTimesheetExpense(id, auth.user.id);
		return json({ success: true }, { headers: corsHeaders });
	} catch (err) {
		if (err instanceof Error && 'status' in err && 'body' in err) {
			return json(
				{ success: false, message: (err as any).body.message },
				{ status: (err as any).status, headers: corsHeaders }
			);
		}
		logger.error('expenses.DELETE failed', { error: err, expenseId: params.id });
		return json(
			{ success: false, message: 'Internal server error' },
			{ status: 500, headers: corsHeaders }
		);
	}
};
