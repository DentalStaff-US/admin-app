import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/database/drizzle';
import { candidateProfileTable } from '$lib/server/database/schemas/candidate';
import {
	requisitionTable,
	requisitionApplicationTable
} from '$lib/server/database/schemas/requisition';
import { authenticateUser } from '$lib/server/serverUtils';
import { and, eq } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { getClientIdByCompanyId } from '$lib/server/database/queries/clients';
import { getPostHogClient } from '$lib/server/posthog';

const corsHeaders = {
	'Access-Control-Allow-Origin': env.CANDIDATE_APP_DOMAIN,
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization',
	'Access-Control-Allow-Credentials': 'true'
};

export const OPTIONS: RequestHandler = async () => {
	return new Response(null, {
		headers: corsHeaders
	});
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		// Validate content type
		const contentType = request.headers.get('content-type');
		if (!contentType?.includes('application/json')) {
			return json(
				{ success: false, message: 'Content-Type must be application/json' },
				{ status: 400, headers: corsHeaders }
			);
		}

		// Authenticate user
		const user = await authenticateUser(request);
		if (!user) {
			return json(
				{ success: false, message: 'Unauthorized' },
				{ status: 401, headers: corsHeaders }
			);
		}

		// Validate request body
		const body = await request.json().catch(() => null);
		if (!body || typeof body.requisitionId !== 'number') {
			return json(
				{ success: false, message: 'Invalid request body' },
				{ status: 400, headers: corsHeaders }
			);
		}

		const { requisitionId } = body;

		return await db.transaction(async (tx) => {
			// Get candidate profile
			const candidateProfile = await tx
				.select()
				.from(candidateProfileTable)
				.where(eq(candidateProfileTable.userId, user.id))
				.limit(1)
				.then((rows) => rows[0]);

			if (!candidateProfile) {
				return json(
					{ success: false, message: 'Candidate profile not found' },
					{ status: 404, headers: corsHeaders }
				);
			}

			// Verify requisition exists and is active
			const requisition = await tx
				.select()
				.from(requisitionTable)
				.where(and(eq(requisitionTable.id, requisitionId), eq(requisitionTable.status, 'OPEN')))
				.limit(1)
				.then((rows) => rows[0]);

			if (!requisition) {
				return json(
					{ success: false, message: 'Requisition not found or not active' },
					{ status: 404, headers: corsHeaders }
				);
			}

			const clientId = await getClientIdByCompanyId(requisition.companyId);

			// Check for existing application
			const existingApplication = await tx
				.select()
				.from(requisitionApplicationTable)
				.where(
					and(
						eq(requisitionApplicationTable.requisitionId, requisitionId),
						eq(requisitionApplicationTable.candidateId, candidateProfile.id)
					)
				)
				.limit(1)
				.then((rows) => rows[0]);

			if (existingApplication) {
				return json(
					{ success: false, message: 'You have already applied to this requisition' },
					{ status: 400, headers: corsHeaders }
				);
			}

			// Create application
			const [application] = await tx
				.insert(requisitionApplicationTable)
				.values({
					id: crypto.randomUUID(),
					requisitionId,
					candidateId: candidateProfile.id,
					createdAt: new Date(),
					updatedAt: new Date(),
					status: 'PENDING',
					clientId
				})
				.returning();

			// Log successful application
			console.log(`New application created: ${application.id} for requisition: ${requisitionId}`);

			const posthog = getPostHogClient();
			posthog.capture({
				distinctId: user.id,
				event: 'candidate_applied',
				properties: {
					application_id: application.id,
					requisition_id: requisitionId,
					company_id: requisition.companyId,
					client_id: clientId
				}
			});

			return json(
				{
					success: true,
					data: {
						application: {
							id: application.id,
							status: application.status,
							createdAt: application.createdAt
						}
					}
				},
				{ headers: corsHeaders }
			);
		});
	} catch (err) {
		console.error('Error in POST /api/external/applyForRequisition:', err);
		// Determine if error is known/expected
		if (err instanceof Error && 'status' in err && 'body' in err) {
			return json(
				{ success: false, message: (err as any).body.message },
				{
					status: (err as any).status,
					headers: corsHeaders
				}
			);
		}

		// Unknown error
		return json(
			{ success: false, message: 'Internal server error' },
			{
				status: 500,
				headers: corsHeaders
			}
		);
	}
};
