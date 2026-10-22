import {
	clientCanCreateRequisitions,
	USER_ROLES,
	type ClientStatus
} from '$lib/config/constants.js';
import { getClientStaffScopedLocationIds } from '$lib/server/scoping';
import { adminRequisitionSchema, clientRequisitionSchema } from '$lib/config/zod-schemas.js';
import { redirectIfNotValidCustomer } from '$lib/server/database/queries/billing';
import {
	billingNotReadyMessage,
	getClientBillingReadiness,
	getCompanyBillingReadiness
} from '$lib/server/billing/readiness';
import {
	getClientCompanyByClientId,
	getClientCompanyById,
	getClientProfileByStaffUserId,
	getClientProfilebyUserId
} from '$lib/server/database/queries/clients.js';
import {
	createRequisition,
	getRequisitionsAdmin,
	getRequisitionsForClient
} from '$lib/server/database/queries/requisitions';
import { parseRequisitionListFilter } from '$lib/server/requisitions/unbilled';
import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit';
import {
	parseSkillRequirementsInput,
	type SkillRequirementCategory
} from '$lib/server/skills/skillRequirements';
import { SkillRequirementError } from '$lib/server/skills/requisitionSkills';
import { setFlash } from 'sveltekit-flash-message/server';
import { message, superValidate } from 'sveltekit-superforms/server';

export const load = async (event: RequestEvent) => {
	const user = event.locals.user;
	const searchTerm = event.url.searchParams.get('search') || '';
	// Allowlisted list views (e.g. the dashboard's "Unbilled Placements" link).
	// Admin-only: client roles ignore it.
	const filter = parseRequisitionListFilter(event.url.searchParams.get('filter'));

	if (!user) {
		redirect(301, '/auth/sign-in');
	}

	if (user?.role === USER_ROLES.SUPERADMIN) {
		const requisitions = await getRequisitionsAdmin(searchTerm, { view: filter });
		const form = await superValidate(event, adminRequisitionSchema);

		return {
			user: event.locals.user,
			searchTerm,
			filter,
			requisitions: requisitions || [],
			adminForm: form,
			clientForm: null,
			clientStatus: null,
			canCreateRequisitions: true,
			billingBlockedMessage: null
		};
	}

	if (user?.role === USER_ROLES.CLIENT) {
		if (!user.completedOnboarding) {
			redirect(302, '/onboarding/client/company');
		}
		const client = await getClientProfilebyUserId(user.id);
		await redirectIfNotValidCustomer(client.id, user.role);

		const clientCompany = await getClientCompanyByClientId(client.id);
		const form = await superValidate(event, clientRequisitionSchema);
		const requisitions = await getRequisitionsForClient(clientCompany.id, searchTerm);

		const clientStatus = (client?.status ?? 'PENDING') as ClientStatus;
		// Billing gate: a STRIPE-billed client with no Stripe customer can't be
		// invoiced, so they may not post requisitions until billing is set up.
		const billing = await getClientBillingReadiness(client.id);
		return {
			user,
			searchTerm,
			filter: null,
			requisitions: requisitions || [],
			clientForm: form,
			adminForm: null,
			clientStatus,
			canCreateRequisitions: clientCanCreateRequisitions(clientStatus) && billing.ready,
			billingBlockedMessage: billing.ready
				? null
				: billingNotReadyMessage({ audience: 'CLIENT', what: 'post requisitions' })
		};
	}

	if (user.role === USER_ROLES.CLIENT_STAFF) {
		const client = await getClientProfileByStaffUserId(user.id);
		await redirectIfNotValidCustomer(client?.id, user.role);

		const company = await getClientCompanyByClientId(client?.id);
		const form = await superValidate(event, clientRequisitionSchema);
		const scopedLocationIds = await getClientStaffScopedLocationIds(user);
		const requisitions = await getRequisitionsForClient(company.id, searchTerm, scopedLocationIds);

		const clientStatus = (client?.status ?? 'PENDING') as ClientStatus;
		const billing = await getClientBillingReadiness(client?.id);
		return {
			user,
			searchTerm,
			filter: null,
			requisitions: requisitions || [],
			clientForm: form,
			adminForm: null,
			clientStatus,
			canCreateRequisitions: clientCanCreateRequisitions(clientStatus) && billing.ready,
			billingBlockedMessage: billing.ready
				? null
				: billingNotReadyMessage({ audience: 'CLIENT', what: 'post requisitions' })
		};
	}

	return {
		user: event.locals.user,
		searchTerm,
		filter: null,
		requisitions: [],
		adminForm: null,
		clientForm: null,
		clientStatus: null,
		canCreateRequisitions: false,
		billingBlockedMessage: null
	};
};

export const actions = {
	admin: async (event: RequestEvent) => {
		const user = event.locals.user;
		if (!user) {
			return fail(403);
		}
		const formData = await event.request.formData();

		const title = formData.get('title') as string;
		const companyId = formData.get('clientId') as string;
		const locationId = formData.get('locationId') as string;
		const disciplineId = formData.get('disciplineId') as string;
		const jobDescription = formData.get('jobDescription') as string;
		const specialInstructions = formData.get('specialInstructions')
			? (formData.get('specialInstructions') as string)
			: null;
		const experienceLevelId = formData.get('experienceLevelId')
			? (formData.get('experienceLevelId') as string)
			: null;
		const timezone = formData.get('timezone') as string;
		const permanentPosition = formData.get('permanentPosition');
		const hourlyRate = Number(formData.get('hourlyRate'));
		const purchaseOrderNumber = formData.get('purchaseOrderNumber') as string;

		// Billing gate: never create work for a client we can't invoice. Admins
		// bypass the client-status gate but not this one — a requisition for a
		// STRIPE client with no customer produces timesheets that can't be approved.
		const billing = await getCompanyBillingReadiness(companyId);
		if (!billing.ready) {
			const company = await getClientCompanyById(companyId);
			const msg = billingNotReadyMessage({
				audience: 'ADMIN',
				what: 'create a requisition',
				companyName: company?.companyName
			});
			setFlash({ type: 'error', message: msg }, event);
			// The drawer submits via superforms `enhance`, which needs a `form` back
			// on failure (a bare fail() leaves it stuck in the submitting state).
			// Built from the submitted data so the admin's inputs survive the
			// round-trip; `message(...)` returns fail(400, { form }) with `msg` in $message.
			const form = await superValidate(formData, adminRequisitionSchema);
			return message(form, msg, { status: 400 });
		}

		const skills = await parseSkillsOrFail(event, formData, adminRequisitionSchema);
		if (!skills.ok) return skills.response;

		const newRequisition = await createSkillAwareRequisition(
			event,
			formData,
			adminRequisitionSchema,
			skills.value,
			{
				createdAt: new Date(),
				updatedAt: new Date(),
				title,
				companyId,
				locationId,
				hourlyRate,
				permanentPosition: permanentPosition as unknown as boolean,
				disciplineId,
				jobDescription,
				specialInstructions,
				experienceLevelId,
				status: 'OPEN',
				referenceTimezone: timezone,
				purchaseOrderNumber
			},
			user.id
		);
		if (!newRequisition.ok) return newRequisition.response;

		setFlash({ type: 'success', message: 'New Requisition Created.' }, event);
		return redirect(302, `/requisitions/${newRequisition.value.id}`);
	},
	client: async (event: RequestEvent) => {
		const user = event.locals.user;

		if (!user) {
			return fail(403);
		}

		const client =
			user && user?.role === USER_ROLES.CLIENT_STAFF
				? await getClientProfileByStaffUserId(user.id)
				: await getClientProfilebyUserId(user.id);

		// Status gate: CLIENT / CLIENT_STAFF can only post when the underlying
		// client profile is ACTIVE. Admins use the `admin` action above and are
		// not subject to this check (they may post on a client's behalf in any
		// status). This mirrors the UI-side hide on the dashboard/requisitions/
		// locations pages — kept here as defense-in-depth.
		if (!clientCanCreateRequisitions((client?.status ?? null) as ClientStatus | null)) {
			setFlash(
				{
					type: 'error',
					message: 'Your account is pending approval and cannot post requisitions yet.'
				},
				event
			);
			return fail(403, { error: 'Client account not approved' });
		}

		const company = client ? await getClientCompanyByClientId(client.id) : null;
		const companyId = company?.id;

		if (!companyId) error(500, 'Invalid or missing CompanyId');

		const formData = await event.request.formData();

		// Billing gate (defense-in-depth for the hidden button): STRIPE-billed
		// clients must have a Stripe customer before they can post.
		const billing = await getClientBillingReadiness(client?.id);
		if (!billing.ready) {
			const msg = billingNotReadyMessage({ audience: 'CLIENT', what: 'post a requisition' });
			setFlash({ type: 'error', message: msg }, event);
			// See the admin action: superforms needs a form back on failure.
			const form = await superValidate(formData, clientRequisitionSchema);
			return message(form, msg, { status: 400 });
		}

		const locationId = formData.get('locationId') as string;
		const disciplineId = formData.get('disciplineId') as string;
		const jobDescription = formData.get('jobDescription') as string;
		const specialInstructions = formData.get('specialInstructions')
			? (formData.get('specialInstructions') as string)
			: null;
		const experienceLevelId = formData.get('experienceLevelId')
			? (formData.get('experienceLevelId') as string)
			: null;
		const permanentPosition = formData.get('permanentPosition');
		const hourlyRate = Number(formData.get('hourlyRate'));
		const timezone = formData.get('timezone') as string;
		const purchaseOrderNumber = formData.get('purchaseOrderNumber') as string;

		const skills = await parseSkillsOrFail(event, formData, clientRequisitionSchema);
		if (!skills.ok) return skills.response;

		const newRequisition = await createSkillAwareRequisition(
			event,
			formData,
			clientRequisitionSchema,
			skills.value,
			{
				createdAt: new Date(),
				updatedAt: new Date(),
				companyId,
				locationId,
				hourlyRate,
				permanentPosition: permanentPosition as unknown as boolean,
				disciplineId,
				jobDescription,
				specialInstructions,
				experienceLevelId,
				status: 'OPEN',
				referenceTimezone: timezone,
				purchaseOrderNumber
			},
			user.id
		);
		if (!newRequisition.ok) return newRequisition.response;

		setFlash({ type: 'success', message: 'New Requisition Created.' }, event);
		return redirect(302, `/requisitions/${newRequisition.value.id}`);
	}
};

type Outcome<T> = { ok: true; value: T } | { ok: false; response: ReturnType<typeof message> };

/**
 * The `skillRequirements` field from SkillRequirementsPicker. Malformed input fails
 * the submit rather than silently posting a requisition with no requirements —
 * returned as a superform message, like the billing gate, so the drawer un-sticks.
 */
async function parseSkillsOrFail(
	event: RequestEvent,
	formData: FormData,
	schema: typeof adminRequisitionSchema | typeof clientRequisitionSchema
): Promise<Outcome<SkillRequirementCategory[]>> {
	try {
		return { ok: true, value: parseSkillRequirementsInput(formData.get('skillRequirements')) };
	} catch {
		const msg = 'The skill requirements could not be read. Please re-select them and try again.';
		setFlash({ type: 'error', message: msg }, event);
		const form = await superValidate(formData, schema);
		return { ok: false, response: message(form, msg, { status: 400 }) };
	}
}

/** createRequisition, turning a bad skill pick into a form message instead of a 500. */
async function createSkillAwareRequisition(
	event: RequestEvent,
	formData: FormData,
	schema: typeof adminRequisitionSchema | typeof clientRequisitionSchema,
	skillRequirements: SkillRequirementCategory[],
	values: Parameters<typeof createRequisition>[0],
	userId: string
): Promise<Outcome<Awaited<ReturnType<typeof createRequisition>>>> {
	try {
		return { ok: true, value: await createRequisition(values, userId, skillRequirements) };
	} catch (e) {
		if (!(e instanceof SkillRequirementError)) throw e;
		setFlash({ type: 'error', message: e.message }, event);
		const form = await superValidate(formData, schema);
		return { ok: false, response: message(form, e.message, { status: 400 }) };
	}
}
