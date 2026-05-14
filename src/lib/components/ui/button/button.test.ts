import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import Button from './button.svelte';

describe('Button', () => {
	it('renders a button element', () => {
		render(Button);
		expect(screen.getByRole('button')).toBeInTheDocument();
	});

	it('fires on:click when clicked', async () => {
		const user = userEvent.setup({ pointerEventsCheck: 0 });
		let clicks = 0;
		const { component } = render(Button);
		component.$on('click', () => clicks++);
		await user.click(screen.getByRole('button'));
		expect(clicks).toBe(1);
	});
});
