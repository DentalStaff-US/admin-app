// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rows = vi.hoisted(() => ({ value: [] as { reportedById: string }[] }));
vi.mock('$lib/server/database/drizzle', () => ({
	default: {
		select: () => ({ from: () => ({ where: () => ({ limit: async () => rows.value }) }) })
	}
}));

import { assertTicketAccess } from './access';

const status = async (p: Promise<unknown>) => {
	try {
		await p;
		return 200;
	} catch (e) {
		return (e as { status: number }).status;
	}
};

describe('assertTicketAccess', () => {
	beforeEach(() => (rows.value = [{ reportedById: 'reporter' }]));

	it('lets the reporter and admins in', async () => {
		expect(await status(assertTicketAccess({ id: 'reporter', role: 'CLIENT' }, 't1'))).toBe(200);
		expect(await status(assertTicketAccess({ id: 'a', role: 'SUPERADMIN' }, 't1'))).toBe(200);
		expect(await status(assertTicketAccess({ id: 'a', role: 'ADMIN' }, 't1'))).toBe(200);
	});

	it("answers 404 for someone else's ticket and for a missing one", async () => {
		expect(await status(assertTicketAccess({ id: 'other', role: 'CLIENT' }, 't1'))).toBe(404);
		expect(await status(assertTicketAccess({ id: 'other', role: 'CLIENT_STAFF' }, 't1'))).toBe(404);
		rows.value = [];
		expect(await status(assertTicketAccess({ id: 'a', role: 'SUPERADMIN' }, 'nope'))).toBe(404);
	});
});
