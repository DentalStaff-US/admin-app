// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
	getTimesheetById: vi.fn(),
	getTimesheetExpenseById: vi.fn(),
	getRequisitionById: vi.fn(),
	getClientProfilebyUserId: vi.fn(),
	getClientProfileByStaffUserId: vi.fn(),
	assertCanAccessLocation: vi.fn()
}));
vi.mock('$lib/server/database/queries/requisitions', () => ({
	getTimesheetById: m.getTimesheetById,
	getTimesheetExpenseById: m.getTimesheetExpenseById,
	getRequisitionById: m.getRequisitionById
}));
vi.mock('$lib/server/database/queries/clients', () => ({
	getClientProfilebyUserId: m.getClientProfilebyUserId,
	getClientProfileByStaffUserId: m.getClientProfileByStaffUserId
}));
vi.mock('$lib/server/scoping', () => ({ assertCanAccessLocation: m.assertCanAccessLocation }));

import { assertTimesheetActionAccess } from './access';

const status = async (p: Promise<unknown>) => {
	try {
		await p;
		return 200;
	} catch (e) {
		return (e as { status: number }).status;
	}
};

describe('assertTimesheetActionAccess', () => {
	beforeEach(() => {
		Object.values(m).forEach((f) => f.mockReset());
		m.getTimesheetById.mockResolvedValue({
			id: 'ts1',
			associatedClientId: 'cl-A',
			requisitionId: 7
		});
		m.getRequisitionById.mockResolvedValue({ id: 7, locationId: 'loc-1' });
		m.assertCanAccessLocation.mockResolvedValue(undefined);
	});

	it("lets a practice owner act on their own practice's timesheet only", async () => {
		m.getClientProfilebyUserId.mockResolvedValue({ id: 'cl-A' });
		expect(await status(assertTimesheetActionAccess({ id: 'u', role: 'CLIENT' }, 'ts1'))).toBe(200);
		m.getClientProfilebyUserId.mockResolvedValue({ id: 'cl-B' });
		expect(await status(assertTimesheetActionAccess({ id: 'u', role: 'CLIENT' }, 'ts1'))).toBe(404);
	});

	it('requires staff to be in the practice and have the location', async () => {
		m.getClientProfileByStaffUserId.mockResolvedValue({ id: 'cl-B' });
		expect(
			await status(assertTimesheetActionAccess({ id: 's', role: 'CLIENT_STAFF' }, 'ts1'))
		).toBe(404);
		m.getClientProfileByStaffUserId.mockResolvedValue({ id: 'cl-A' });
		expect(
			await status(assertTimesheetActionAccess({ id: 's', role: 'CLIENT_STAFF' }, 'ts1'))
		).toBe(200);
		expect(m.assertCanAccessLocation).toHaveBeenCalledWith(
			{ id: 's', role: 'CLIENT_STAFF' },
			'loc-1'
		);
		m.assertCanAccessLocation.mockRejectedValue({ status: 403 });
		expect(
			await status(assertTimesheetActionAccess({ id: 's', role: 'CLIENT_STAFF' }, 'ts1'))
		).toBe(403);
	});

	it('lets admins through, but not for an unknown timesheet', async () => {
		expect(await status(assertTimesheetActionAccess({ id: 'a', role: 'SUPERADMIN' }, 'ts1'))).toBe(
			200
		);
		expect(await status(assertTimesheetActionAccess({ id: 'a', role: 'ADMIN' }, 'ts1'))).toBe(200);
		m.getTimesheetById.mockResolvedValue(null);
		expect(await status(assertTimesheetActionAccess({ id: 'a', role: 'SUPERADMIN' }, 'nope'))).toBe(
			404
		);
	});

	it('refuses an expense from a different timesheet, even for admins', async () => {
		m.getTimesheetExpenseById.mockResolvedValue({ id: 'e1', timesheetId: 'ts-other' });
		expect(
			await status(
				assertTimesheetActionAccess({ id: 'a', role: 'SUPERADMIN' }, 'ts1', { expenseId: 'e1' })
			)
		).toBe(404);
		m.getTimesheetExpenseById.mockResolvedValue({ id: 'e1', timesheetId: 'ts1' });
		m.getClientProfilebyUserId.mockResolvedValue({ id: 'cl-A' });
		expect(
			await status(
				assertTimesheetActionAccess({ id: 'u', role: 'CLIENT' }, 'ts1', { expenseId: 'e1' })
			)
		).toBe(200);
	});

	it('refuses other roles', async () => {
		expect(await status(assertTimesheetActionAccess({ id: 'c', role: 'CANDIDATE' }, 'ts1'))).toBe(
			403
		);
	});
});
