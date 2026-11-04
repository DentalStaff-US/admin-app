import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { writable } from 'svelte/store';
import { superValidate } from 'sveltekit-superforms/server';
import { massNotificationSchema } from '$lib/config/zod-schemas';
import { draftStorageKey, loadDraft, saveDraft } from '$lib/_helpers/massNotificationDraft';
import Page from './+page.svelte';

let onResult: (event: { result: { type: string } }) => void;

vi.mock('sveltekit-superforms/client', () => ({
	superForm: (form: { data: Record<string, unknown> }, options: { onResult: typeof onResult }) => {
		onResult = options.onResult;
		return {
			form: writable(structuredClone(form.data)),
			errors: writable({}),
			allErrors: writable([]),
			submitting: writable(false),
			enhance: () => ({ destroy() {} })
		};
	}
}));

const KEY = draftStorageKey('admin-1');

function renderPage(
	formData: Record<string, unknown> = {
		name: '',
		audience: 'CANDIDATE',
		channel: 'SMS',
		body: '',
		staleOnly: false
	}
) {
	return render(Page, {
		props: {
			data: {
				form: { data: formData },
				disciplines: [],
				experienceLevels: [],
				candidateStatuses: [],
				clientStatuses: [],
				defaultRadiusMiles: 60,
				testDefaults: { email: 'admin@example.com' },
				draftOwnerId: 'admin-1'
			} as never
		}
	});
}

async function settleAutosave() {
	await tick();
	await vi.advanceTimersByTimeAsync(600);
	await tick();
}

describe('mass notification draft autosave', () => {
	beforeEach(() => {
		localStorage.clear();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it('treats a fresh visit with the real schema defaults as no draft', async () => {
		const { data: formDefaults } = await superValidate(massNotificationSchema);
		renderPage(formDefaults);
		await settleAutosave();

		expect(localStorage.getItem(KEY)).toBeNull();

		// A refresh must come back as a clean page, with nothing to restore.
		cleanup();
		renderPage(formDefaults);
		await settleAutosave();
		expect(localStorage.getItem(KEY)).toBeNull();
		expect(screen.queryByText(/Restored your unsent draft/)).toBeNull();
	});

	it('saves typed details and writes nothing for an untouched form', async () => {
		renderPage();
		await settleAutosave();
		expect(loadDraft(KEY)).toBeNull();

		await fireEvent.input(screen.getByLabelText('Name (internal)'), {
			target: { value: 'Marysville blast' }
		});
		await fireEvent.input(screen.getByLabelText('Message'), { target: { value: 'Hello' } });
		await settleAutosave();

		expect(loadDraft(KEY)?.fields).toMatchObject({ name: 'Marysville blast', body: 'Hello' });
	});

	it('shows no indicator until edited, then saving, then saved', async () => {
		renderPage();
		await settleAutosave();
		expect(screen.getByRole('status').textContent?.trim()).toBe('');

		await fireEvent.input(screen.getByLabelText('Message'), { target: { value: 'Hello' } });
		await tick();
		expect(screen.getByText('Saving draft…')).toBeTruthy();

		await settleAutosave();
		expect(screen.queryByText('Saving draft…')).toBeNull();
		expect(screen.getByText(/^Draft saved/)).toBeTruthy();
	});

	it('says so when the browser refuses to save', async () => {
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new Error('quota');
		});
		renderPage();
		await settleAutosave();
		await fireEvent.input(screen.getByLabelText('Message'), { target: { value: 'Hello' } });
		await settleAutosave();

		expect(screen.getByText("Couldn't save draft in this browser")).toBeTruthy();
	});

	it('drops the draft and indicator when edits return the form to its defaults', async () => {
		const { data: formDefaults } = await superValidate(massNotificationSchema);
		renderPage(formDefaults);
		await settleAutosave();

		const audience = screen.getByLabelText('Audience');
		await fireEvent.change(audience, { target: { value: 'CLIENT' } });
		await settleAutosave();
		expect(loadDraft(KEY)?.fields).toEqual({ audience: 'CLIENT' });

		await fireEvent.change(screen.getByLabelText('Audience'), { target: { value: 'CANDIDATE' } });
		await tick();

		expect(localStorage.getItem(KEY)).toBeNull();
		expect(screen.getByRole('status').textContent?.trim()).toBe('');
	});

	it('removes a leftover draft that holds only defaults, without a restore banner', async () => {
		saveDraft(KEY, { audience: 'CANDIDATE', channel: 'SMS' });
		renderPage();
		await settleAutosave();

		expect(localStorage.getItem(KEY)).toBeNull();
		expect(screen.queryByText(/Restored your unsent draft/)).toBeNull();
	});

	it('restores a draft, including its location, and warns about selections', async () => {
		saveDraft(
			KEY,
			{
				name: 'Marysville blast',
				audience: 'CLIENT',
				clientRecipientTarget: 'OWNER',
				channel: 'EMAIL',
				subject: 'Hi',
				body: 'Hello',
				locationLabel: 'Marysville, Washington',
				locationLat: 48.05,
				locationLon: -122.18,
				radiusMiles: 25
			},
			1000
		);
		renderPage();
		await settleAutosave();

		expect((screen.getByLabelText('Name (internal)') as HTMLInputElement).value).toBe(
			'Marysville blast'
		);
		expect((screen.getByLabelText('Subject') as HTMLInputElement).value).toBe('Hi');
		expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe('Hello');
		expect((screen.getByLabelText('Audience') as HTMLSelectElement).value).toBe('CLIENT');
		expect(
			(screen.getByPlaceholderText('Search a city or address…') as HTMLInputElement).value
		).toBe('Marysville, Washington');
		expect(screen.getByText(/Recipient selections aren't saved/)).toBeTruthy();
		// Restoring is not an edit, so the original saved time is kept.
		expect(loadDraft(KEY)?.savedAt).toBe(1000);
	});

	it('flushes a pending edit when the page is closed', async () => {
		renderPage();
		await settleAutosave();
		await fireEvent.input(screen.getByLabelText('Message'), { target: { value: 'Hello' } });
		await tick();

		window.dispatchEvent(new Event('pagehide'));

		expect(loadDraft(KEY)?.fields.body).toBe('Hello');
	});

	it('keeps the draft on a failed queue and clears it once queued', async () => {
		renderPage();
		await settleAutosave();
		await fireEvent.input(screen.getByLabelText('Message'), { target: { value: 'Hello' } });
		await settleAutosave();

		onResult({ result: { type: 'failure' } });
		await settleAutosave();
		expect(loadDraft(KEY)?.fields.body).toBe('Hello');

		onResult({ result: { type: 'redirect' } });
		await settleAutosave();
		expect(loadDraft(KEY)).toBeNull();
	});

	it('does not save again after queueing', async () => {
		const { unmount } = renderPage();
		await settleAutosave();
		await fireEvent.input(screen.getByLabelText('Message'), { target: { value: 'Hello' } });
		await tick();

		onResult({ result: { type: 'redirect' } });
		unmount();
		await settleAutosave();

		expect(loadDraft(KEY)).toBeNull();
	});

	it('names who is excluded from the send in the preview', async () => {
		const row = (key: string, name: string, to: string | null) => ({ key, name, to });
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				json: async () => ({
					count: 1,
					total: 3,
					optedOut: 1,
					noContact: 1,
					channel: 'EMAIL',
					recipients: [row('a', 'Eligible Person', 'in@example.com')],
					optedOutRecipients: [row('b', 'Opted Out Person', 'out@example.com')],
					noContactRecipients: [row('c', 'No Contact Person', null)]
				})
			})
		);
		renderPage();
		await settleAutosave();

		await fireEvent.click(screen.getByRole('button', { name: /Preview & select recipients/ }));
		await settleAutosave();

		expect(screen.getByText(/View the 1\s+opted out/)).toBeTruthy();
		expect(screen.getByText('out@example.com')).toBeTruthy();
		expect(screen.getByText('No Contact Person')).toBeTruthy();
		// Excluded people can't be picked as recipients.
		expect(screen.getAllByRole('checkbox', { name: /Eligible Person/ })).toHaveLength(1);
		expect(screen.queryByRole('checkbox', { name: /Opted Out Person/ })).toBeNull();
		vi.unstubAllGlobals();
	});

	it('discards a restored draft and clears the form', async () => {
		vi.spyOn(window, 'confirm').mockReturnValue(true);
		saveDraft(KEY, {
			name: 'Old',
			body: 'Hello',
			locationLabel: 'Marysville, Washington',
			locationLat: 48.05,
			locationLon: -122.18
		});
		renderPage();
		await settleAutosave();

		await fireEvent.click(screen.getByRole('button', { name: 'Discard draft' }));
		await settleAutosave();

		expect(loadDraft(KEY)).toBeNull();
		expect((screen.getByLabelText('Name (internal)') as HTMLInputElement).value).toBe('');
		expect(
			(screen.getByPlaceholderText('Search a city or address…') as HTMLInputElement).value
		).toBe('');
		expect(screen.queryByText(/Recipient selections aren't saved/)).toBeNull();
	});
});
