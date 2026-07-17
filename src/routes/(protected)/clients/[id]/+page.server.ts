import type { PageServerLoad, RequestEvent } from './$types';
import {
	createCompanyLocation,
	getAllClientLocationsByCompanyId,
	getAllClientStaffProfiles,
	getCalendarEventsForClient,
	getClientCompanyByClientId,
	getClientProfileById,
	getClientSubscription,
	getPendingInvitesForCompany,
	getPrimaryLocationForStaff,
	getStaffLocationsWithMeta,
	inviteStaffUsersToAccount,
	resendInvite,
	revokeInvite,
	setStaffLocations
} from '$lib/server/database/queries/clients';
import { fail, redirect } from '@sveltejs/kit';
import { CLIENT_STATUS, USER_ROLES, type ClientStatus } from '$lib/config/constants';
import { notifyClientStatusChange } from '$lib/server/notifications/transactional';
import {
	getSupportTicketsForClient
	// getSupportTicketsForUser
} from '$lib/server/database/queries/support';
import {
	createInvoiceRecord,
	createPaperInvoiceRecord,
	getClientInvoices,
	getRequisitionsForClient
} from '$lib/server/database/queries/requisitions';
import { createStripeInvoice, withCardProcessingFee } from '$lib/server/stripe';
import { syncBillingFromStripe } from '$lib/server/database/queries/billing';
import { dueDateEndOfDayInTimezone } from '$lib/_helpers/UTCTimezoneUtils';
import { logger } from '$lib/server/logger';
import { z } from 'zod';
import { message, setError, superValidate } from 'sveltekit-superforms/server';
import { setFlash } from 'sveltekit-flash-message/server';
import {
	adminRequisitionSchema,
	newClientCompanyLocationSchema,
	updateClientSchema
} from '$lib/config/zod-schemas';
import db from '$lib/server/database/drizzle';
import { userTable, type User } from '$lib/server/database/schemas/auth';
import {
	clientCompanyTable,
	type ClientCompany,
	type ClientProfile,
	clientProfileTable
} from '$lib/server/database/schemas/client';
import { eq } from 'drizzle-orm';
import {
	addComment,
	deleteComment,
	getCommentsForClient
} from '$lib/server/database/queries/admin';
import { getCandidateByEmail } from '$lib/server/database/queries/candidates';
import {
	addCandidateToBlacklist,
	getBlacklistedCandidatesForCompany,
	removeCandidateFromBlacklist
} from '$lib/server/database/queries/blacklist';
// import { getClientBillingInfo } from '$lib/server/database/queries/billing';
import {
	getClientDocuments,
	uploadClientDocument,
	deleteClientDocument,
	toggleClientDocumentLock
} from '$lib/server/database/queries/clients';

const LineItemSchema = z.array(
	z.object({
		description: z.string().optional(),
		amount: z.number().min(0, 'Item amount must be a positive number'),
		quantity: z.any().transform((val) => {
			// Fractional quantities are allowed (e.g. 1.5 hrs) — Stripe bills them via
			// quantity_decimal. Must still be a positive number.
			const parsed = parseFloat(val);
			if (isNaN(parsed) || parsed <= 0) {
				throw new Error('Item quantity must be a positive number');
			}
			return parsed;
		}),
		rate: z.string().transform((val) => {
			const parsed = parseFloat(val);
			if (isNaN(parsed) || parsed < 0) {
				throw new Error('Item rate must be a non-negative number');
			}
			return parsed;
		})
	})
);

const ClientStatusSchema = z.object({
	status: z.enum([
		CLIENT_STATUS.PENDING,
		CLIENT_STATUS.ACTIVE,
		CLIENT_STATUS.INACTIVE,
		CLIENT_STATUS.DENIED
	])
});

const NewInvoiceSchema = z.object({
	amount: z.number().min(0, 'Amount must be a positive number'),
	dueDate: z.string().optional(),
	description: z.string().optional(),
	invoiceMethod: z.enum(['STRIPE', 'PAPER']).default('STRIPE'),
	items: z.string().transform((val) => {
		try {
			return JSON.parse(val);
		} catch {
			return [];
		}
	})
});

export const load: PageServerLoad = async ({ locals, params }) => {
	const user = locals.user;
	if (!user) {
		redirect(302, '/auth/sign-in');
	}

	if (user.role !== USER_ROLES.SUPERADMIN) {
		redirect(302, '/dashboard');
	}

	const { id } = params;

	// Reconcile billing state against Stripe BEFORE reading the subscription
	// row, so the "Setup Customer" / "Resend Link" buttons gate on Stripe truth
	// rather than a potentially-stale DB row. This is the page-load half of
	// the convergence work — webhook drift (Ginny's case) heals itself the
	// next time an admin opens this page.
	await syncBillingFromStripe(id);

	const result = await getClientProfileById(id);
	const locations = result.company ? await getAllClientLocationsByCompanyId(result.company.id) : [];
	const requisitions = await getRequisitionsForClient(result.company.id);
	const recurrenceDays = await getCalendarEventsForClient(id);
	const supportTickets = await getSupportTicketsForClient(result.profile.id);
	const staff = await getAllClientStaffProfiles(result.company.id);
	const pendingInvites = await getPendingInvitesForCompany(result.company.id);
	const invoices = await getClientInvoices(id, { includeStripeData: true });
	const invoiceForm = await superValidate(NewInvoiceSchema);
	const requisitionForm = await superValidate(adminRequisitionSchema);
	const locationForm = await superValidate(newClientCompanyLocationSchema);
	const documents = await getClientDocuments(result.profile.id);

	const updateClientForm = await superValidate(
		{
			firstName: result.user.firstName,
			lastName: result.user.lastName,
			email: result.user.email,
			companyName: result.company.companyName || undefined,
			baseLocation: result.company.baseLocation || '',
			website: result.company.website || '',
			cellPhone: result.profile.cellPhone || '',
			invoiceMethod: result.profile.clientInvoiceMethod || 'STRIPE'
		},
		updateClientSchema
	);

	const statusForm = await superValidate(
		{ status: (result.profile.status ?? CLIENT_STATUS.PENDING) as ClientStatus },
		ClientStatusSchema
	);

	const staffWithPrimaryLocation = await Promise.all(
		staff.map(async (member) => {
			const [primaryLocation, allLocations] = await Promise.all([
				getPrimaryLocationForStaff(member.profile.id),
				getStaffLocationsWithMeta(member.profile.id)
			]);
			return {
				...member,
				primaryLocation: primaryLocation ? primaryLocation : null,
				// All current location assignments + which one is primary, so
				// the Manage Locations dialog can hydrate its initial state.
				locationAssignments: allLocations.map((l) => ({
					locationId: l.locationId,
					isPrimary: !!l.isPrimary,
					locationName: l.locationName
				}))
			};
		})
	);

	const comments = await getCommentsForClient(id);

	const blacklistedCandidates = result.company
		? await getBlacklistedCandidatesForCompany(result.company.id)
		: [];

	return result
		? {
				user,
				client: {
					profile: result.profile,
					user: result.user,
					company: result.company,
					locations: locations,
					subscription: result.subscription
				},
				requisitions,
				recurrenceDays,
				supportTickets,
				staff: staffWithPrimaryLocation,
				pendingInvites,
				invoices,
				invoiceForm,
				requisitionForm,
				locationForm,
				updateClientForm,
				statusForm,
				comments,
				documents,
				blacklistedCandidates
			}
		: {
				user,
				client: null,
				requisitions: [],
				recurrenceDays: [],
				supportTickets: [],
				pendingInvites: [],
				invoices: [],
				staff: [],
				invoiceForm,
				updateClientForm,
				requisitionForm,
				locationForm,
				statusForm,
				comments: [],
				documents: []
			};
};

const InviteStaffSchema = z.object({
	locationId: z.string().min(1, 'Location is required'),
	invitees: z
		.string()
		.transform((val) => {
			try {
				return JSON.parse(val);
			} catch {
				return [];
			}
		})
		.pipe(
			z
				.array(
					z.object({
						email: z.string().email(),
						staffRole: z.enum(['CLIENT_ADMIN', 'CLIENT_MANAGER', 'CLIENT_EMPLOYEE'])
					})
				)
				.min(1, 'Add at least one invitee')
		)
});

const StaffLocationsSchema = z.object({
	staffId: z.string().min(1),
	locationIds: z
		.string()
		.transform((val) => {
			try {
				const parsed = JSON.parse(val);
				return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
			} catch {
				return [] as string[];
			}
		})
		.pipe(z.array(z.string())),
	primaryLocationId: z
		.string()
		.optional()
		.transform((v) => (v && v.length > 0 ? v : null))
});

export const actions = {
	updateStatus: async (event: RequestEvent) => {
		const user = event.locals.user;
		const { id: clientId } = event.params;

		if (!user || user.role !== USER_ROLES.SUPERADMIN) {
			return fail(403, { error: 'Not authorized' });
		}

		const form = await superValidate(event, ClientStatusSchema);
		if (!form.valid) {
			return fail(400, { form });
		}

		try {
			const [previous] = await db
				.select({ status: clientProfileTable.status })
				.from(clientProfileTable)
				.where(eq(clientProfileTable.id, clientId))
				.limit(1);
			if (!previous) {
				return setError(form, 'Client not found');
			}

			const next = form.data.status as ClientStatus;
			if (previous.status === next) {
				return message(form, 'Status unchanged');
			}

			await db
				.update(clientProfileTable)
				.set({ status: next, updatedAt: new Date() })
				.where(eq(clientProfileTable.id, clientId));

			// Fire-and-forget client-facing email. Dispatcher swallows its own
			// errors; admin's save success doesn't depend on email delivery.
			await notifyClientStatusChange(clientId, next);

			setFlash({ type: 'success', message: `Client marked ${next.toLowerCase()}` }, event);
			return message(form, `Client status set to ${next}`);
		} catch (err) {
			logger.error('updateClientStatus failed', {
				error: err,
				clientId,
				distinctId: user?.id
			});
			setFlash({ type: 'error', message: 'Failed to update client status' }, event);
			return setError(form, 'Failed to update client status');
		}
	},
	createInvoice: async (request: RequestEvent) => {
		const user = request.locals.user;
		const { id: clientId } = request.params;

		if (!user || user.role !== USER_ROLES.SUPERADMIN) {
			redirect(302, '/dashboard');
		}

		const form = await superValidate(request, NewInvoiceSchema);

		try {
			const lineItems = await LineItemSchema.parseAsync(form.data.items);
			const dateString = form.data.dueDate;
			const invoiceMethod = form.data.invoiceMethod; // 'STRIPE' | 'PAPER'

			// Get client info for customer name/email
			const clientResult = await getClientProfileById(clientId);
			const customerName = `${clientResult.user.firstName} ${clientResult.user.lastName}`;
			const customerEmail = clientResult.user.email;

			if (invoiceMethod === 'PAPER') {
				await createPaperInvoiceRecord(
					{
						clientId,
						amountInDollars: form.data.amount.toFixed(2),
						dueDate: dateString,
						description: form.data.description,
						lineItems: lineItems.map((item) => ({
							id: crypto.randomUUID(),
							description: item.description ?? null,
							quantity: item.quantity,
							rate: item.rate,
							unit_amount: Math.round(item.rate * 100),
							unit_amount_excluding_tax: Math.round(item.rate * 100),
							amount: Math.round(item.amount * 100),
							currency: 'usd',
							type: 'paper' as const
						})),
						customerEmail,
						customerName
					},
					user.id
				);
			} else {
				// Existing Stripe flow. Anchor the picked date to end-of-day in
				// the business timezone so "due today" submitted from ET in the
				// morning still resolves to a future UTC instant (Stripe rejects
				// past `due_date` values).
				const dueDate = dueDateEndOfDayInTimezone(dateString)?.toISOString();
				const stripeCustomerId = await getClientSubscription(clientId);

				if (stripeCustomerId) {
					// Adds a card processing fee (3%) for card-paying clients.
					const invoiceLineItems = await withCardProcessingFee(
						stripeCustomerId,
						lineItems.map((item) => ({
							amountInCents: Math.round(item.amount * 100),
							description: item.description || '',
							quantity: item.quantity || 1,
							unitAmountInCents: Math.round(item.rate * 100),
							currency: 'usd'
						}))
					);
					const invoice = await createStripeInvoice(
						stripeCustomerId,
						invoiceLineItems,
						{ clientId, userId: clientResult.user.id },
						form.data.description,
						dueDate
					);
					await createInvoiceRecord(
						{
							clientId,
							stripeInvoice: invoice,
							amountInDollars: (invoice.amount_due / 100).toFixed(2)
						},
						user.id
					);
				} else {
					throw new Error('Stripe customer ID not found for the client');
				}
			}

			setFlash({ type: 'success', message: 'Invoice created successfully' }, request);
			return message(form, 'Invoice created successfully');
		} catch (err) {
			logger.error('admin create invoice failed', {
				error: err,
				clientId,
				distinctId: user?.id
			});
			setFlash({ type: 'error', message: 'Failed to create invoice' }, request);
			return setError(form, 'Failed to create invoice');
		}
	},
	createLocation: async (event) => {
		const { id } = event.params;
		const form = await superValidate(event, newClientCompanyLocationSchema);

		if (!form.valid) {
			return { form };
		}

		const user = event.locals.user;

		if (!user) {
			return redirect(301, '/auth/sign-in');
		}

		if (user.role === USER_ROLES.SUPERADMIN) {
			const clientCompany = await getClientCompanyByClientId(id);

			if (!clientCompany) {
				return { form };
			}

			const result = await createCompanyLocation({
				id: crypto.randomUUID(),
				createdAt: new Date(),
				updatedAt: new Date(),
				name: form.data.name,
				companyPhone: form.data.companyPhone,
				email: form.data.email || null,
				companyId: form.data.companyId,
				streetOne: form.data.streetOne || null,
				streetTwo: form.data.streetTwo || null,
				city: form.data.city || null,
				state: form.data.state || null,
				zipcode: form.data.zipcode || null,
				timezone: form.data.timezone,
				lat: form.data.lat.toString(),
				lon: form.data.lon.toString(),
				completeAddress: form.data.completeAddress,
				operatingHours: {
					0: {
						openTime: '00:00',
						closeTime: '00:00',
						isClosed: false,
						timezone: form.data.timezone || 'America/New_York'
					},
					1: {
						openTime: '00:00',
						closeTime: '00:00',
						isClosed: false,
						timezone: form.data.timezone || 'America/New_York'
					},
					2: {
						openTime: '00:00',
						closeTime: '00:00',
						isClosed: false,
						timezone: form.data.timezone || 'America/New_York'
					},
					3: {
						openTime: '00:00',
						closeTime: '00:00',
						isClosed: false,
						timezone: form.data.timezone || 'America/New_York'
					},
					4: {
						openTime: '00:00',
						closeTime: '00:00',
						isClosed: false,
						timezone: form.data.timezone || 'America/New_York'
					},
					5: {
						openTime: '00:00',
						closeTime: '00:00',
						isClosed: false,
						timezone: form.data.timezone || 'America/New_York'
					},
					6: {
						openTime: '00:00',
						closeTime: '00:00',
						isClosed: false,
						timezone: form.data.timezone || 'America/New_York'
					}
				}
			});

			if (result) {
				setFlash(
					{
						type: 'success',
						message: 'Location created successfully'
					},
					event
				);
				return { form, success: true, message: 'Location created successfully' };
			} else {
				setFlash(
					{
						type: 'error',
						message: 'Failed to create location'
					},
					event
				);
				return { form, error: 'Failed to create location' };
			}
		}
	},
	updateClient: async (event: RequestEvent) => {
		const user = event.locals.user;
		const { id: clientId } = event.params;

		if (!user || user.role !== USER_ROLES.SUPERADMIN) {
			redirect(302, '/dashboard');
		}

		const form = await superValidate(event, updateClientSchema);

		if (!form.valid) {
			console.log('Invalid form data:', form.data);
			setFlash({ type: 'error', message: 'Invalid form data' }, event);
			return { form };
		}

		console.log(form.data);
		try {
			const client = await getClientProfileById(clientId);

			const userUpdate: Partial<User> = { updatedAt: new Date() };
			const profileUpdate: Partial<ClientProfile> = { updatedAt: new Date() };
			const companyUpdate: Partial<ClientCompany> = { updatedAt: new Date() };

			if (form.data.firstName !== undefined) userUpdate.firstName = form.data.firstName;
			if (form.data.lastName !== undefined) userUpdate.lastName = form.data.lastName;
			if (form.data.email !== undefined) userUpdate.email = form.data.email;
			if (form.data.companyName !== undefined) companyUpdate.companyName = form.data.companyName;
			if (form.data.baseLocation !== undefined)
				companyUpdate.baseLocation = form.data.baseLocation || null;
			if (form.data.website !== undefined) companyUpdate.website = form.data.website || null;
			if (form.data.cellPhone !== undefined) profileUpdate.cellPhone = form.data.cellPhone || null;
			if (form.data.invoiceMethod !== undefined)
				profileUpdate.clientInvoiceMethod = form.data.invoiceMethod;

			if (Object.keys(userUpdate).length > 1) {
				await db.update(userTable).set(userUpdate).where(eq(userTable.id, client.user.id));
			}

			if (Object.keys(profileUpdate).length > 1) {
				await db
					.update(clientProfileTable)
					.set(profileUpdate)
					.where(eq(clientProfileTable.id, client.profile.id));
			}

			if (Object.keys(companyUpdate).length > 1) {
				await db
					.update(clientCompanyTable)
					.set(companyUpdate)
					.where(eq(clientCompanyTable.id, client.company.id));
			}

			setFlash({ type: 'success', message: 'Client updated successfully' }, event);
			return message(form, 'Client updated successfully');
		} catch (error) {
			console.error('Error updating client:', error);
			setFlash({ type: 'error', message: 'Failed to update client' }, event);
			return setError(form, 'Failed to update client');
		}
	},
	inviteStaff: async (event: RequestEvent) => {
		const user = event.locals.user;
		const { id: clientId } = event.params;

		if (!user || user.role !== USER_ROLES.SUPERADMIN) {
			return fail(403, { error: 'Unauthorized' });
		}

		const formData = await event.request.formData();
		const parsed = InviteStaffSchema.safeParse({
			locationId: formData.get('locationId'),
			invitees: formData.get('invitees')
		});
		if (!parsed.success) {
			return fail(400, { error: parsed.error.errors[0]?.message ?? 'Invalid invite' });
		}

		try {
			const client = await getClientProfileById(clientId);
			if (!client?.company) {
				return fail(404, { error: 'Client not found' });
			}

			// Validate the chosen location belongs to this client's company.
			const ownedLocations = await getAllClientLocationsByCompanyId(client.company.id);
			if (!ownedLocations.some((l) => l.id === parsed.data.locationId)) {
				return fail(400, { error: 'Location does not belong to this client' });
			}

			const INVITE_EXPIRATION_DAYS = 7;
			const expiresAt = new Date();
			expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRATION_DAYS);

			const invites = parsed.data.invitees.map((invitee) => ({
				id: crypto.randomUUID(),
				email: invitee.email.toLowerCase(),
				staffRole: invitee.staffRole,
				invitedRole: 'CLIENT_STAFF' as const,
				referrerRole: user.role as 'CANDIDATE' | 'CLIENT_STAFF' | 'SUPERADMIN' | 'CLIENT',
				referrerId: user.id,
				expiresAt
			}));

			const results = await inviteStaffUsersToAccount(parsed.data.locationId, invites);
			const failures = results.filter((r) => !r.success);

			if (failures.length === invites.length) {
				setFlash({ type: 'error', message: 'Failed to send invites' }, event);
				return fail(500, { error: 'All invites failed' });
			}

			if (failures.length > 0) {
				setFlash(
					{
						type: 'success',
						message: `Sent ${invites.length - failures.length}/${invites.length} invites. Some failed.`
					},
					event
				);
			} else {
				setFlash(
					{
						type: 'success',
						message: `Sent ${invites.length} invite${invites.length === 1 ? '' : 's'}`
					},
					event
				);
			}
			return { success: true };
		} catch (err) {
			logger.error('admin inviteStaff failed', { error: err, clientId, distinctId: user.id });
			setFlash({ type: 'error', message: 'Failed to send invites' }, event);
			return fail(500, { error: 'Internal error' });
		}
	},

	resendStaffInvite: async (event: RequestEvent) => {
		const user = event.locals.user;
		const { id: clientId } = event.params;
		if (!user || user.role !== USER_ROLES.SUPERADMIN) {
			return fail(403, { error: 'Unauthorized' });
		}
		const formData = await event.request.formData();
		const inviteId = formData.get('inviteId') as string;
		if (!inviteId) return fail(400, { error: 'Missing inviteId' });

		try {
			const client = await getClientProfileById(clientId);
			if (!client?.company) return fail(404, { error: 'Client not found' });
			const result = await resendInvite(inviteId, client.company.id);
			if (!result?.success) {
				setFlash({ type: 'error', message: 'Failed to resend invite email' }, event);
				return fail(500, { error: 'Resend failed' });
			}
			setFlash({ type: 'success', message: 'Invite email resent' }, event);
			return { success: true };
		} catch (err) {
			if (err && typeof err === 'object' && 'status' in err && 'body' in err) throw err;
			logger.error('admin resendStaffInvite failed', { error: err, clientId, distinctId: user.id });
			setFlash({ type: 'error', message: 'Failed to resend invite' }, event);
			return fail(500, { error: 'Internal error' });
		}
	},

	revokeStaffInvite: async (event: RequestEvent) => {
		const user = event.locals.user;
		const { id: clientId } = event.params;
		if (!user || user.role !== USER_ROLES.SUPERADMIN) {
			return fail(403, { error: 'Unauthorized' });
		}
		const formData = await event.request.formData();
		const inviteId = formData.get('inviteId') as string;
		if (!inviteId) return fail(400, { error: 'Missing inviteId' });

		try {
			const client = await getClientProfileById(clientId);
			if (!client?.company) return fail(404, { error: 'Client not found' });
			await revokeInvite(inviteId, client.company.id);
			setFlash({ type: 'success', message: 'Invite revoked' }, event);
			return { success: true };
		} catch (err) {
			if (err && typeof err === 'object' && 'status' in err && 'body' in err) throw err;
			logger.error('admin revokeStaffInvite failed', { error: err, clientId, distinctId: user.id });
			setFlash({ type: 'error', message: 'Failed to revoke invite' }, event);
			return fail(500, { error: 'Internal error' });
		}
	},

	updateStaffLocations: async (event: RequestEvent) => {
		const user = event.locals.user;
		const { id: clientId } = event.params;

		if (!user || user.role !== USER_ROLES.SUPERADMIN) {
			return fail(403, { error: 'Unauthorized' });
		}

		const formData = await event.request.formData();
		const parsed = StaffLocationsSchema.safeParse({
			staffId: formData.get('staffId'),
			locationIds: formData.get('locationIds'),
			primaryLocationId: formData.get('primaryLocationId')
		});
		if (!parsed.success) {
			return fail(400, { error: 'Invalid form' });
		}

		try {
			const client = await getClientProfileById(clientId);
			if (!client?.company) {
				return fail(404, { error: 'Client not found' });
			}

			await setStaffLocations({
				staffId: parsed.data.staffId,
				companyId: client.company.id,
				locationIds: parsed.data.locationIds,
				primaryLocationId: parsed.data.primaryLocationId
			});

			setFlash({ type: 'success', message: 'Staff locations updated' }, event);
			return { success: true };
		} catch (err) {
			if (err && typeof err === 'object' && 'status' in err && 'body' in err) {
				throw err;
			}
			logger.error('admin updateStaffLocations failed', {
				error: err,
				clientId,
				distinctId: user.id
			});
			setFlash({ type: 'error', message: 'Failed to update staff locations' }, event);
			return fail(500, { error: 'Internal error' });
		}
	},

	addComment: async (event: RequestEvent) => {
		const user = event.locals.user;
		if (!user || user.role !== USER_ROLES.SUPERADMIN) return fail(403);

		const { id } = event.params;
		const formData = await event.request.formData();
		const body = formData.get('body') as string;

		if (!body?.trim()) return fail(400, { error: 'Comment cannot be empty' });

		await addComment({ body: body.trim(), authorId: user.id, clientId: id });
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
	},
	uploadClientDocument: async (event: RequestEvent) => {
		const user = event.locals.user;
		if (!user || user.role !== USER_ROLES.SUPERADMIN) return fail(403);

		const { id } = event.params;
		const formData = await event.request.formData();
		const uploadUrl = formData.get('uploadUrl') as string;
		const filename = formData.get('filename') as string;
		const type = formData.get('type') as 'LICENSE' | 'CERTIFICATE' | 'AGREEMENT' | 'OTHER';
		const adminOnly = formData.get('adminOnly') === 'true';

		try {
			await uploadClientDocument({ clientId: id, uploadUrl, filename, type, adminOnly });
			setFlash({ type: 'success', message: 'Document uploaded successfully' }, event);
			return { success: true };
		} catch (err) {
			console.error(err);
			setFlash({ type: 'error', message: 'Failed to upload document' }, event);
			return fail(500, { error: 'Failed to upload document' });
		}
	},

	deleteClientDocument: async (event: RequestEvent) => {
		const user = event.locals.user;
		if (!user || user.role !== USER_ROLES.SUPERADMIN) return fail(403);

		const formData = await event.request.formData();
		const documentId = formData.get('documentId') as string;

		try {
			await deleteClientDocument(documentId);
			setFlash({ type: 'success', message: 'Document deleted' }, event);
			return { success: true };
		} catch (err) {
			console.error(err);
			setFlash({ type: 'error', message: 'Failed to delete document' }, event);
			return fail(500, { error: 'Failed to delete document' });
		}
	},

	toggleClientDocumentLock: async (event: RequestEvent) => {
		const user = event.locals.user;
		if (!user || user.role !== USER_ROLES.SUPERADMIN) return fail(403);

		const formData = await event.request.formData();
		const documentId = formData.get('documentId') as string;

		try {
			await toggleClientDocumentLock(documentId);
			setFlash({ type: 'success', message: 'Document updated' }, event);
			return { success: true };
		} catch (err) {
			console.error(err);
			setFlash({ type: 'error', message: 'Failed to update document' }, event);
			return fail(500, { error: 'Failed to update document' });
		}
	},

	// Look up a candidate by email so the admin can confirm before blacklisting.
	// Returns the match in the action result for the card to render.
	searchBlacklistCandidate: async (event: RequestEvent) => {
		const user = event.locals.user;
		if (!user || user.role !== USER_ROLES.SUPERADMIN) return fail(403);

		const formData = await event.request.formData();
		const email = String(formData.get('email') ?? '')
			.trim()
			.toLowerCase();
		if (!email) return fail(400, { searchError: 'Enter an email to search.' });

		try {
			const match = await getCandidateByEmail(email);
			return {
				searchResult: {
					candidateId: match.profile.id,
					firstName: match.user.firstName,
					lastName: match.user.lastName,
					email: match.user.email,
					avatarUrl: match.user.avatarUrl
				}
			};
		} catch {
			return fail(404, { searchEmail: email, searchError: 'No candidate found with that email.' });
		}
	},

	addBlacklist: async (event: RequestEvent) => {
		const user = event.locals.user;
		if (!user || user.role !== USER_ROLES.SUPERADMIN) return fail(403);

		const { id } = event.params;
		const formData = await event.request.formData();
		const candidateId = String(formData.get('candidateId') ?? '').trim();
		if (!candidateId) return fail(400, { error: 'Missing candidate id' });

		const company = await getClientCompanyByClientId(id);
		if (!company) return fail(404, { error: 'Company not found' });

		try {
			const { cancelledWorkdays } = await addCandidateToBlacklist(candidateId, company.id, {
				actorUserId: user.id,
				actorRole: 'SUPERADMIN',
				reason: 'admin'
			});
			setFlash(
				{
					type: 'success',
					message:
						cancelledWorkdays > 0
							? `Candidate blacklisted. ${cancelledWorkdays} future shift(s) cancelled.`
							: 'Candidate blacklisted.'
				},
				event
			);
			return { success: true };
		} catch (err) {
			logger.error('addBlacklist failed', { error: err, candidateId, clientId: id });
			setFlash({ type: 'error', message: 'Failed to blacklist candidate' }, event);
			return fail(500, { error: 'Failed to blacklist candidate' });
		}
	},

	removeBlacklist: async (event: RequestEvent) => {
		const user = event.locals.user;
		if (!user || user.role !== USER_ROLES.SUPERADMIN) return fail(403);

		const { id } = event.params;
		const formData = await event.request.formData();
		const candidateId = String(formData.get('candidateId') ?? '').trim();
		if (!candidateId) return fail(400, { error: 'Missing candidate id' });

		const company = await getClientCompanyByClientId(id);
		if (!company) return fail(404, { error: 'Company not found' });

		try {
			await removeCandidateFromBlacklist(candidateId, company.id);
			setFlash({ type: 'success', message: 'Candidate removed from blacklist' }, event);
			return { success: true };
		} catch (err) {
			logger.error('removeBlacklist failed', { error: err, candidateId, clientId: id });
			setFlash({ type: 'error', message: 'Failed to remove from blacklist' }, event);
			return fail(500, { error: 'Failed to remove from blacklist' });
		}
	}
};
