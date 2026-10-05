import { describe, it, expect, beforeEach, vi } from 'vitest';

// vi.mock factories are hoisted, so the fake db lives in vi.hoisted — same pattern
// as src/lib/server/audit/audit.test.ts.
const { state, fakeDb } = vi.hoisted(() => {
	const state = { selectResult: [] as unknown[] };

	function chain(resolveTo: () => unknown) {
		const c: Record<string, unknown> = {};
		for (const m of ['select', 'from', 'where', 'limit', 'innerJoin', 'leftJoin', 'orderBy']) {
			c[m] = () => c;
		}
		c.then = (res: (v: unknown) => void, rej: (e: unknown) => void) =>
			Promise.resolve().then(resolveTo).then(res, rej);
		return c;
	}

	return { state, fakeDb: { select: () => chain(() => state.selectResult) } };
});

vi.mock('$lib/server/database/drizzle', () => ({ default: fakeDb }));

const { assertCandidateDocumentEditable } = await import('./candidateDocumentGuards');

const OWNER = 'cand-1';

/** The row shape the guard selects. Defaults to an approved, unlocked document. */
function row(over: Record<string, unknown> = {}) {
	return {
		id: 'doc-1',
		ownerId: OWNER,
		locked: false,
		adminOnly: false,
		status: 'ACTIVE',
		approved: true,
		...over
	};
}

const call = (opts: Partial<Parameters<typeof assertCandidateDocumentEditable>[0]> = {}) =>
	assertCandidateDocumentEditable({ documentId: 'doc-1', candidateId: OWNER, ...opts });

beforeEach(() => {
	state.selectResult = [row()];
});

describe('ownership and existence', () => {
	it('refuses a missing document', async () => {
		state.selectResult = [];
		expect(await call()).toMatchObject({ allowed: false, reason: 'NOT_FOUND' });
	});

	it("refuses another candidate's document without confirming it exists", async () => {
		state.selectResult = [row({ ownerId: 'someone-else' })];
		const d = await call();
		expect(d).toMatchObject({ allowed: false, reason: 'NOT_OWNER' });
		expect(d).toHaveProperty('message', 'Document not found.');
	});
});

describe('approval freeze (unchanged for existing callers)', () => {
	it('refuses an unscoped edit once approved', async () => {
		// No `fields` → original all-or-nothing behaviour, which is what replace and
		// delete still get.
		expect(await call()).toMatchObject({ allowed: false, reason: 'APPROVED' });
	});

	it('allows an unscoped edit while still pending', async () => {
		state.selectResult = [row({ status: 'PENDING', approved: false })];
		expect(await call()).toEqual({ allowed: true });
	});

	it('refuses a plain type edit once approved, even with fields given', async () => {
		// Retyping a vetted agreement is exactly what the freeze exists to stop.
		expect(await call({ fields: ['type'], nextType: 'CERTIFICATE' })).toMatchObject({
			allowed: false,
			reason: 'APPROVED'
		});
	});

	it('refuses a filename edit once approved', async () => {
		expect(await call({ fields: ['filename'] })).toMatchObject({
			allowed: false,
			reason: 'APPROVED'
		});
	});
});

describe('credential-metadata carve-out', () => {
	it('allows correcting expiry and discipline link after approval', async () => {
		expect(await call({ fields: ['expiryDate'] })).toEqual({ allowed: true });
		expect(await call({ fields: ['disciplineId'] })).toEqual({ allowed: true });
		expect(await call({ fields: ['expiryDate', 'disciplineId'] })).toEqual({ allowed: true });
	});

	it('refuses when a non-metadata field rides along', async () => {
		expect(await call({ fields: ['expiryDate', 'filename'] })).toMatchObject({
			allowed: false,
			reason: 'APPROVED'
		});
	});

	it('refuses an empty field list rather than treating it as metadata-only', async () => {
		expect(await call({ fields: [] })).toMatchObject({ allowed: false, reason: 'APPROVED' });
	});
});

describe('DESIGNATE_CREDENTIAL intent', () => {
	const designate = (fields: string[], nextType: string | null) =>
		call({ intent: 'DESIGNATE_CREDENTIAL', fields, nextType });

	it('allows setting type to a credential type alongside the link and expiry', async () => {
		// The legacy path: uploads were forced to OTHER, so hundreds of working
		// professionals must be able to designate an existing file without re-uploading.
		expect(await designate(['type', 'disciplineId', 'expiryDate'], 'CERTIFICATE')).toEqual({
			allowed: true
		});
		expect(await designate(['type', 'disciplineId', 'expiryDate'], 'LICENSE')).toEqual({
			allowed: true
		});
	});

	it('refuses designating to a non-credential type', async () => {
		for (const t of ['AGREEMENT', 'OTHER', 'RESUME']) {
			expect(await designate(['type', 'disciplineId', 'expiryDate'], t)).toMatchObject({
				allowed: false,
				reason: 'APPROVED'
			});
		}
	});

	it('refuses when an unrelated field rides along with the intent', async () => {
		expect(await designate(['type', 'filename'], 'CERTIFICATE')).toMatchObject({
			allowed: false,
			reason: 'APPROVED'
		});
	});
});

describe('admin pin outranks every carve-out', () => {
	it('refuses a metadata edit on a locked document', async () => {
		state.selectResult = [row({ locked: true })];
		expect(await call({ fields: ['expiryDate'] })).toMatchObject({
			allowed: false,
			reason: 'LOCKED'
		});
	});

	it('refuses a designation on an adminOnly document', async () => {
		// adminOnly is a delete/edit lock, not a visibility flag.
		state.selectResult = [row({ adminOnly: true })];
		expect(
			await call({
				intent: 'DESIGNATE_CREDENTIAL',
				fields: ['type', 'disciplineId', 'expiryDate'],
				nextType: 'CERTIFICATE'
			})
		).toMatchObject({ allowed: false, reason: 'LOCKED' });
	});

	it('reports LOCKED rather than APPROVED when both apply', async () => {
		// Ordering assertion: the pin is evaluated first, so the message names the
		// actual blocker.
		state.selectResult = [row({ locked: true, approved: true })];
		expect(await call()).toMatchObject({ allowed: false, reason: 'LOCKED' });
	});
});
