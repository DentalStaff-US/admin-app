// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const commandSearch = vi.hoisted(() => vi.fn(async () => [{ kind: 'requisition', label: '#1', detail: '', href: '/requisitions/1' }]));
vi.mock('$lib/server/search/commandSearch', () => ({ commandSearch }));

import { GET } from './+server';

const call = async (user: object | null, q = 'smith') => {
	try {
		return (await GET({ locals: { user }, url: new URL(`http://t/api/search?q=${q}`) } as any)) as Response;
	} catch (e) {
		return e as { status: number };
	}
};

describe('GET /api/search', () => {
	beforeEach(() => commandSearch.mockClear());

	it('refuses logged-out users and practices without searching', async () => {
		expect((await call(null)).status).toBe(401);
		expect((await call({ role: 'CLIENT' })).status).toBe(403);
		expect((await call({ role: 'CLIENT_STAFF' })).status).toBe(403);
		expect(commandSearch).not.toHaveBeenCalled();
	});

	it('searches for SUPERADMIN and ADMIN', async () => {
		for (const role of ['SUPERADMIN', 'ADMIN']) {
			const res = (await call({ role })) as Response;
			expect(res.status).toBe(200);
		}
		expect(commandSearch).toHaveBeenCalledWith('smith');
	});
});
