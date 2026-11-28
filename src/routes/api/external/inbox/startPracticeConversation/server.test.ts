// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const start = vi.hoisted(() => vi.fn());
const profileRows = vi.hoisted(() => ({ value: [{ id: 'c-pro' }] as { id: string }[] }));

vi.mock('$lib/server/inbox/practiceConversation', () => ({ startPracticeConversation: start }));
vi.mock('$lib/server/serverUtils', () => ({
	authenticateUser: vi.fn(async () => ({ id: 'u-pro' }))
}));
vi.mock('$lib/server/logger', () => ({ logger: { error: vi.fn() } }));
vi.mock('$lib/server/database/drizzle', () => ({
	default: {
		select: () => ({ from: () => ({ where: () => ({ limit: async () => profileRows.value }) }) })
	}
}));

import { POST } from './+server';

const send = (body: unknown) =>
	POST({
		request: new Request('http://test', { method: 'POST', body: JSON.stringify(body) })
	} as any);

const statusOf = async (p: unknown) => {
	try {
		return ((await p) as Response).status;
	} catch (e) {
		return (e as { status: number }).status;
	}
};

describe('POST /api/external/inbox/startPracticeConversation', () => {
	beforeEach(() => {
		start.mockReset();
		profileRows.value = [{ id: 'c-pro' }];
	});

	it('rejects an empty or whitespace message without starting anything', async () => {
		expect(await statusOf(send({ timesheetId: 'ts-1', body: '   ' }))).toBe(400);
		expect(await statusOf(send({ timesheetId: 'ts-1' }))).toBe(400);
		expect(start).not.toHaveBeenCalled();
	});

	it('acts as the authenticated professional, with the trimmed message', async () => {
		start.mockResolvedValue({ ok: true, conversationId: 'conv-1', created: true });
		const res = (await send({ timesheetId: 'ts-1', body: '  Hi there  ' })) as Response;
		expect(await res.json()).toEqual({ conversationId: 'conv-1', created: true });
		expect(start).toHaveBeenCalledWith({
			userId: 'u-pro',
			candidateId: 'c-pro',
			link: { timesheetId: 'ts-1' },
			body: 'Hi there'
		});
	});

	it('also starts from a claimed shift, and needs one or the other', async () => {
		start.mockResolvedValue({ ok: true, conversationId: 'conv-2', created: true });
		await send({ workdayId: 'wd-1', body: 'Where do I park?' });
		expect(start).toHaveBeenCalledWith(
			expect.objectContaining({ link: { workdayId: 'wd-1' }, body: 'Where do I park?' })
		);
		start.mockClear();
		expect(await statusOf(send({ body: 'hi' }))).toBe(400);
		expect(start).not.toHaveBeenCalled();
	});

	it('passes through not-found and blocked refusals', async () => {
		start.mockResolvedValue({ ok: false, status: 404, message: 'Timesheet not found' });
		expect(await statusOf(send({ timesheetId: 'ts-x', body: 'hi' }))).toBe(404);
		start.mockResolvedValue({ ok: false, status: 403, message: "You can't message this practice" });
		expect(await statusOf(send({ timesheetId: 'ts-1', body: 'hi' }))).toBe(403);
	});

	it('404s for a user with no professional profile', async () => {
		profileRows.value = [];
		expect(await statusOf(send({ timesheetId: 'ts-1', body: 'hi' }))).toBe(404);
		expect(start).not.toHaveBeenCalled();
	});
});
