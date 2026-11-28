import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import ConfirmDialogFixture from './ConfirmDialogFixture.svelte';

describe('ConfirmDialog', () => {
	it('enables confirm straight away without confirmText', async () => {
		render(ConfirmDialogFixture);
		expect(await screen.findByRole('button', { name: 'Delete' })).toBeEnabled();
		expect(screen.queryByLabelText(/to continue/)).toBeNull();
	});

	it('keeps confirm disabled until the exact word is typed, and posts it', async () => {
		const user = userEvent.setup({ pointerEventsCheck: 0 });
		render(ConfirmDialogFixture, { confirmText: 'DELETE' });
		const button = await screen.findByRole('button', { name: 'Delete' });
		const input = screen.getByLabelText(/Type DELETE to continue/);
		expect(button).toBeDisabled();
		await user.type(input, 'delete');
		expect(button).toBeDisabled();
		await user.clear(input);
		await user.type(input, 'DELETE');
		expect(button).toBeEnabled();
		expect((document.querySelector('input[name="confirm"]') as HTMLInputElement).value).toBe('DELETE');
	});
});
