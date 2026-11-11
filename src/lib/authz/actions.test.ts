// @vitest-environment node
/**
 * Representative server actions refuse an ADMIN (AZ-3/AZ-8): void an invoice,
 * mass send, change app settings, and the admin invite and role screens.
 * Impersonation is covered in $lib/server/impersonation.test.ts.
 *
 * Each action's first step after the permission gate is superValidate, so it
 * stands in as the "got past the gate" probe: an ADMIN must never reach it, a
 * SUPERADMIN must. Nothing else in these routes runs.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { superValidate, voidInvoiceAndNotify, dbWrites } = vi.hoisted(() => ({
	superValidate: vi.fn(async () => ({ valid: false, data: {}, errors: {} })),
	voidInvoiceAndNotify: vi.fn(),
	dbWrites: vi.fn()
}));

vi.mock('sveltekit-superforms/server', () => ({ superValidate, message: vi.fn(), setError: vi.fn() }));
vi.mock('sveltekit-flash-message/server', () => ({ setFlash: vi.fn() }));
vi.mock('$lib/server/database/drizzle', () => ({
	default: { update: dbWrites, insert: dbWrites, select: dbWrites, transaction: dbWrites }
}));
vi.mock('$lib/server/invoices/voidNotify', () => ({ voidInvoiceAndNotify }));
vi.mock('$lib/server/stripe', () => ({ stripe: {}, voidStripeInvoice: vi.fn(), getStripeInvoicePayments: vi.fn() }));
vi.mock('$lib/server/affiliate/accrual', () => ({ accrueCommissionForPaidInvoice: vi.fn(), reverseCommissionForInvoice: vi.fn() }));
vi.mock('$lib/server/database/queries/requisitions', () => ({}));
vi.mock('$lib/server/database/queries/clients', () => ({}));
vi.mock('$lib/server/requisitions/paymentStatus', () => ({ syncRequisitionPaymentStatus: vi.fn() }));
vi.mock('$lib/server/notifications/transactional', () => ({}));
vi.mock('$lib/server/database/queries/admin', () => ({
	writeActionHistory: vi.fn(),
	getAdminUsers: vi.fn(async () => []),
	countActiveSuperadmins: vi.fn(async () => 2),
	getAdminUserById: vi.fn(async (id: string) => ({ id, role: id.startsWith('super') ? 'SUPERADMIN' : 'ADMIN', email: `${id}@x.test` })),
	setStaffRole: dbWrites,
	deleteAdminUser: dbWrites,
	updateAdminUserProfile: dbWrites
}));
vi.mock('$lib/server/audit/audit', () => ({ recordView: vi.fn(), recordAction: vi.fn() }));
vi.mock('$lib/server/audit/queries', () => ({ getActivityForEntity: vi.fn() }));
vi.mock('$lib/server/database/queries/skills', () => ({}));
vi.mock('$lib/server/database/queries/campaigns', () => ({}));
vi.mock('$lib/server/database/queries/config', () => ({}));
vi.mock('$lib/server/email/emailService', () => ({ EmailService: vi.fn() }));
vi.mock('$lib/server/database/queries/users', () => ({ getUserByEmail: vi.fn(async () => null) }));

const SUPER = { id: 'super-1', role: 'SUPERADMIN', email: 's@x.test' };
const ADMIN = { id: 'admin-1', role: 'ADMIN', email: 'a@x.test' };

function event(user: unknown, form: Record<string, string> = {}) {
	const body = new FormData();
	for (const [k, v] of Object.entries(form)) body.set(k, v);
	return {
		locals: { user },
		params: { id: 'inv-1' },
		url: new URL('http://t/'),
		cookies: { get: () => undefined, set: () => {} },
		request: new Request('http://t/', { method: 'POST', body })
	} as never;
}

/** Run an action; a thrown redirect/error comes back as its value. */
async function run(fn: (e: never) => unknown, e: never): Promise<any> {
	try {
		return await fn(e);
	} catch (thrown) {
		return thrown;
	}
}

beforeEach(() => {
	superValidate.mockClear();
	voidInvoiceAndNotify.mockClear();
	dbWrites.mockClear();
});

describe('void an invoice (invoices.void)', async () => {
	const { actions } = await import('../../routes/(protected)/invoices/[id]/+page.server');

	it('refuses an ADMIN before reading the form or touching the invoice', async () => {
		const result = await run(actions.voidInvoice, event(ADMIN));
		expect(result).toMatchObject({ status: 302, location: '/auth/sign-in' });
		expect(superValidate).not.toHaveBeenCalled();
		expect(voidInvoiceAndNotify).not.toHaveBeenCalled();
		expect(dbWrites).not.toHaveBeenCalled();
	});

	it('also refuses an ADMIN recording or reversing a payment', async () => {
		for (const name of ['recordPaperTransaction', 'reversePaperPayment', 'adminProcessInvoice'] as const) {
			const result = await run(actions[name], event(ADMIN));
			expect(result, name).toMatchObject({ status: 302 });
		}
		expect(superValidate).not.toHaveBeenCalled();
	});

	it('lets a SUPERADMIN through the gate', async () => {
		const result = await run(actions.voidInvoice, event(SUPER));
		expect(superValidate).toHaveBeenCalledTimes(1);
		expect(result).toMatchObject({ status: 400 }); // the stubbed form is invalid
	});
});

describe('mass send (comms.massSend)', async () => {
	const { actions } = await import('../../routes/(protected)/admin/menu/mass-notifications/create/+page.server');

	it('refuses an ADMIN with 403 and never builds the audience', async () => {
		const result = await run(actions.queue, event(ADMIN));
		expect(result).toMatchObject({ status: 403 });
		expect(superValidate).not.toHaveBeenCalled();
	});

	it('lets a SUPERADMIN through the gate', async () => {
		await run(actions.queue, event(SUPER));
		expect(superValidate).toHaveBeenCalledTimes(1);
	});
});

describe('app settings change (platform.configure)', async () => {
	const { actions } = await import('../../routes/(protected)/admin/menu/application-settings/+page.server');

	it('refuses an ADMIN and writes nothing', async () => {
		const result = await run(actions.updateSettings, event(ADMIN));
		expect(result).toMatchObject({ status: 401 });
		expect(superValidate).not.toHaveBeenCalled();
		expect(dbWrites).not.toHaveBeenCalled();
	});

	it('lets a SUPERADMIN through the gate', async () => {
		await run(actions.updateSettings, event(SUPER));
		expect(superValidate).toHaveBeenCalledTimes(1);
	});
});

describe('team invites and roles (admins.manage, AZ-4)', async () => {
	const invite = await import('../../routes/(protected)/admin/menu/admins/+page.server');
	const detail = await import('../../routes/(protected)/admin/menu/admins/[id]/+page.server');

	function detailEvent(user: unknown, id: string, form: Record<string, string>) {
		const e = event(user, form) as any;
		e.params = { id };
		return e as never;
	}

	it('an ADMIN cannot invite a team member', async () => {
		superValidate.mockResolvedValueOnce({ valid: true, data: { email: 'new@x.test', role: 'ADMIN' }, errors: {} } as never);
		const result = await run(invite.actions.default, event(ADMIN));
		expect(result).toMatchObject({ status: 403 });
		expect(dbWrites).not.toHaveBeenCalled();
	});

	it('an ADMIN cannot change anyone’s role', async () => {
		const result = await run(detail.actions.setRole, detailEvent(ADMIN, 'admin-2', { role: 'SUPERADMIN' }));
		expect(result).toMatchObject({ status: 403 });
		expect(dbWrites).not.toHaveBeenCalled();
	});

	it('a SUPERADMIN can promote an ADMIN', async () => {
		const result = await run(detail.actions.setRole, detailEvent(SUPER, 'admin-2', { role: 'SUPERADMIN' }));
		expect(result).toEqual({ success: true });
		expect(dbWrites).toHaveBeenCalledWith('admin-2', 'SUPERADMIN');
	});

	it('a SUPERADMIN cannot change their own role', async () => {
		const result = await run(detail.actions.setRole, detailEvent(SUPER, 'super-1', { role: 'ADMIN' }));
		expect(result).toMatchObject({ status: 400 });
		expect(dbWrites).not.toHaveBeenCalled();
	});
});
