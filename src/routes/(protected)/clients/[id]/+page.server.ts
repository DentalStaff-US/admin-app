import type { PageServerLoad, RequestEvent } from './$types';
import {
	createCompanyLocation,
	getAllClientLocationsByCompanyId,
	getAllClientStaffProfiles,
	getCalendarEventsForClient,
	getClientCompanyByClientId,
	getClientProfileById,
	getClientSubscription,
	getPrimaryLocationForStaff
} from '$lib/server/database/queries/clients';
import { fail, redirect } from '@sveltejs/kit';
import { USER_ROLES } from '$lib/config/constants';
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
import { createStripeInvoice } from '$lib/server/stripe';
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
			const parsed = parseInt(val, 10);
			if (isNaN(parsed) || parsed <= 0) {
				throw new Error('Item quantity must be a positive integer');
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

	const result = await getClientProfileById(id);
	const locations = result.company ? await getAllClientLocationsByCompanyId(result.company.id) : [];
	const requisitions = await getRequisitionsForClient(result.company.id);
	const recurrenceDays = await getCalendarEventsForClient(id);
	const supportTickets = await getSupportTicketsForClient(result.profile.id);
	const staff = await getAllClientStaffProfiles(result.company.id);
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
			cellPhone: result.profile.cellPhone || '',
			invoiceMethod: result.profile.clientInvoiceMethod || 'STRIPE'
		},
		updateClientSchema
	);

	const staffWithPrimaryLocation = await Promise.all(
		staff.map(async (member) => {
			const primaryLocation = await getPrimaryLocationForStaff(member.profile.id);
			return {
				...member,
				primaryLocation: primaryLocation ? primaryLocation : null
			};
		})
	);

	const comments = await getCommentsForClient(id);

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
				invoices,
				invoiceForm,
				requisitionForm,
				locationForm,
				updateClientForm,
				comments,
				documents
			}
		: {
				user,
				client: null,
				requisitions: [],
				recurrenceDays: [],
				supportTickets: [],
				invoices: [],
				staff: [],
				invoiceForm,
				updateClientForm,
				requisitionForm,
				locationForm,
				comments: [],
				documents: []
			};
};

export const actions = {
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
							description: item.description,
							quantity: item.quantity,
							rate: item.rate,
							unit_amount: Math.round(item.rate * 100),
							unit_amount_excluding_tax: Math.round(item.rate * 100),
							amount: Math.round(item.amount * 100),
							currency: 'usd',
							type: 'paper'
						})),
						customerEmail,
						customerName
					},
					user.id
				);
			} else {
				// Existing Stripe flow
				const localDate = new Date(dateString + 'T00:00:00');
				const utcDate = localDate.toISOString();
				const stripeCustomerId = await getClientSubscription(clientId);

				if (stripeCustomerId) {
					const invoice = await createStripeInvoice(
						stripeCustomerId,
						lineItems.map((item) => ({
							amountInCents: Math.round(item.amount * 100),
							description: item.description || '',
							quantity: item.quantity || 1,
							currency: 'usd'
						})),
						{ clientId },
						form.data.description,
						utcDate
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
			setFlash({ type: 'error', message: 'Failed to create invoice' }, request);
			console.error('Error creating invoice:', err);
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
		const type = formData.get('type') as 'LICENSE' | 'CERTIFICATE' | 'AGGREEMENT' | 'OTHER';
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
	}
};
