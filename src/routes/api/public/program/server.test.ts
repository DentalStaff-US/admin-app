import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$env/dynamic/public', () => ({ env: { PUBLIC_JOB_BOARD_ENABLED: 'false' } }));
vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$lib/server/logger', () => ({ logger: { error: vi.fn() } }));
vi.mock('$lib/server/database/queries/affiliates', () => ({
	getAffiliateConfig: vi.fn()
}));

import { GET } from './+server';
import { getAffiliateConfig } from '$lib/server/database/queries/affiliates';
import { resetRateLimits } from '$lib/server/publicJobs/http';

const event = () =>
	({
		request: new Request('http://admin.test/api/public/program'),
		url: new URL('http://admin.test/api/public/program'),
		getClientAddress: () => '203.0.113.9'
	}) as unknown as Parameters<typeof GET>[0];

describe('GET /api/public/program', () => {
	beforeEach(() => {
		resetRateLimits();
		vi.mocked(getAffiliateConfig).mockReset();
	});

	it('returns the program defaults as numbers, even with the job board off', async () => {
		vi.mocked(getAffiliateConfig).mockResolvedValue({
			commissionRate: '3.00',
			payoutMinimum: '25.00',
			programEnabled: false
		});
		const res = await GET(event());
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ referralCommissionPercent: 3, referralPayoutMinimum: 25 });
	});

	it('returns 500 without detail when the config read fails', async () => {
		vi.mocked(getAffiliateConfig).mockRejectedValue(new Error('db down'));
		const res = await GET(event());
		expect(res.status).toBe(500);
		expect(await res.json()).toEqual({ error: true, message: 'Internal server error' });
	});
});
