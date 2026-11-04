import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	clearDraft,
	draftStorageKey,
	loadDraft,
	pickDraftFields,
	saveDraft
} from '$lib/_helpers/massNotificationDraft';

const KEY = draftStorageKey('user-1');

describe('massNotificationDraft', () => {
	beforeEach(() => {
		localStorage.clear();
		vi.restoreAllMocks();
	});

	it('scopes drafts per user', () => {
		expect(draftStorageKey('a')).not.toBe(draftStorageKey('b'));
	});

	it('never keeps the recipient selection', () => {
		const fields = pickDraftFields({
			body: 'Hello',
			applyRecipientSelection: true,
			selectedRecipientKeys: ['user|person@example.com']
		});
		expect(fields).toEqual({ body: 'Hello' });
	});

	it('treats emptied fields the same as untouched ones', () => {
		expect(pickDraftFields({ name: '', radiusMiles: null, staleOnly: false })).toEqual({});
	});

	it('treats values an untouched form settles on as no content', () => {
		expect(
			pickDraftFields({ audience: 'CANDIDATE', channel: 'SMS', clientRecipientTarget: 'OWNER' })
		).toEqual({});
		expect(pickDraftFields({ name: '   ', body: '\n' })).toEqual({});
	});

	it('keeps a select changed away from its default', () => {
		expect(pickDraftFields({ audience: 'CLIENT', channel: 'EMAIL' })).toEqual({
			audience: 'CLIENT',
			channel: 'EMAIL'
		});
	});

	it('ignores a stored draft holding only defaults', () => {
		saveDraft(KEY, { audience: 'CANDIDATE', channel: 'SMS' });
		expect(loadDraft(KEY)).toBeNull();
	});

	it('keeps a zero coordinate or pay rate', () => {
		expect(pickDraftFields({ payRateMin: 0 })).toEqual({ payRateMin: 0 });
	});

	it('round-trips a campaign', () => {
		const fields = pickDraftFields({
			name: 'Marysville',
			audience: 'CLIENT',
			channel: 'EMAIL',
			subject: 'Hi',
			body: 'Hello {{firstName}}',
			locationLabel: 'Marysville, Washington',
			locationLat: 48.05,
			locationLon: -122.18,
			radiusMiles: 25,
			staleOnly: true
		});
		expect(saveDraft(KEY, fields, 1000)).toBe(true);
		expect(loadDraft(KEY)).toEqual({ savedAt: 1000, fields });
	});

	it('drops unknown fields from a stored payload', () => {
		localStorage.setItem(
			KEY,
			JSON.stringify({
				savedAt: 1,
				fields: { body: 'Hello', selectedRecipientKeys: ['x'], applyRecipientSelection: true }
			})
		);
		expect(loadDraft(KEY)?.fields).toEqual({ body: 'Hello' });
	});

	it('ignores missing or corrupt drafts', () => {
		expect(loadDraft(KEY)).toBeNull();
		localStorage.setItem(KEY, '{not json');
		expect(loadDraft(KEY)).toBeNull();
		localStorage.setItem(KEY, JSON.stringify({ fields: {} }));
		expect(loadDraft(KEY)).toBeNull();
	});

	it('clears a draft', () => {
		saveDraft(KEY, { body: 'Hello' });
		clearDraft(KEY);
		expect(loadDraft(KEY)).toBeNull();
	});

	it('reports a failed save instead of throwing', () => {
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new Error('quota');
		});
		expect(saveDraft(KEY, { body: 'Hello' })).toBe(false);
	});
});
