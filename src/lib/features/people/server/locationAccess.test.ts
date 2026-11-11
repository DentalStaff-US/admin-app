// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
	rows: [] as unknown[],
	owner: vi.fn(),
	staff: vi.fn(),
	company: vi.fn(),
	scope: vi.fn()
}));
vi.mock('$lib/server/database/drizzle', () => ({
	default: { select: () => ({ from: () => ({ where: () => ({ limit: async () => m.rows }) }) }) }
}));
vi.mock('$lib/server/database/queries/clients', () => ({
	getClientProfilebyUserId: m.owner,
	getClientProfileByStaffUserId: m.staff,
	getClientCompanyByClientId: m.company
}));
vi.mock('$lib/server/scoping', () => ({ assertCanAccessLocation: m.scope }));

import { assertLocationAccess, assertStaffInCompany } from './locationAccess';

const status = async (p: Promise<unknown>) => {
	try {
		await p;
		return 200;
	} catch (e) {
		return (e as { status: number }).status;
	}
};

describe('assertLocationAccess', () => {
	beforeEach(() => {
		m.rows = [{ companyId: 'co-A' }];
		m.owner.mockResolvedValue({ id: 'cl-A' });
		m.staff.mockResolvedValue({ id: 'cl-A' });
		m.company.mockImplementation(async (id: string) => ({ id: id === 'cl-A' ? 'co-A' : 'co-B' }));
		m.scope.mockReset().mockResolvedValue(undefined);
	});

	it("lets an owner act on their practice's location, not another's", async () => {
		expect(await assertLocationAccess({ id: 'u', role: 'CLIENT' }, 'loc')).toEqual({
			companyId: 'co-A'
		});
		m.owner.mockResolvedValue({ id: 'cl-B' });
		expect(await status(assertLocationAccess({ id: 'u', role: 'CLIENT' }, 'loc'))).toBe(404);
	});

	it('also applies location scope to staff', async () => {
		expect(await status(assertLocationAccess({ id: 's', role: 'CLIENT_STAFF' }, 'loc'))).toBe(200);
		expect(m.scope).toHaveBeenCalledWith({ id: 's', role: 'CLIENT_STAFF' }, 'loc');
		m.scope.mockRejectedValue({ status: 403 });
		expect(await status(assertLocationAccess({ id: 's', role: 'CLIENT_STAFF' }, 'loc'))).toBe(403);
	});

	it('404s an unknown location, and lets admins through', async () => {
		expect(await status(assertLocationAccess({ id: 'a', role: 'SUPERADMIN' }, 'loc'))).toBe(200);
		m.rows = [];
		expect(await status(assertLocationAccess({ id: 'a', role: 'SUPERADMIN' }, 'nope'))).toBe(404);
	});

	it('refuses other roles', async () => {
		expect(await status(assertLocationAccess({ id: 'c', role: 'CANDIDATE' }, 'loc'))).toBe(404);
	});
});

describe('assertStaffInCompany', () => {
	it('refuses staff from another company', async () => {
		m.rows = [];
		expect(await status(assertStaffInCompany('st', 'co-A'))).toBe(404);
		m.rows = [{ id: 'st' }];
		expect(await status(assertStaffInCompany('st', 'co-A'))).toBe(200);
	});
});
