import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import SvelteTableFixture from './SvelteTableFixture.svelte';

const rows = [
	{ name: 'Maria', status: 'PENDING', hours: 8 },
	{ name: 'Alex', status: 'APPROVED', hours: 6 }
];

const bodyText = () =>
	screen
		.getAllByRole('row')
		.slice(1)
		.map((r) =>
			within(r)
				.getAllByRole('cell')
				.map((c) => c.textContent?.trim())
		);

describe('svelte-table shim (Svelte 5)', () => {
	it('renders string headers, header functions, text cells and bound components', () => {
		render(SvelteTableFixture, { rows });
		expect(screen.getAllByRole('columnheader').map((h) => h.textContent?.trim())).toEqual([
			'Name',
			'Status',
			'Hours'
		]);
		expect(bodyText()).toEqual([
			['Maria', 'PENDING', '8 hrs'],
			['Alex', 'APPROVED', '6 hrs']
		]);
		// The status cell is the real Badge component with its bound props.
		expect(screen.getByText('PENDING').tagName).toBe('SPAN');
	});

	it('re-renders when table state changes (sorting)', async () => {
		const user = userEvent.setup();
		render(SvelteTableFixture, { rows });
		await user.click(screen.getByRole('button', { name: 'Name' }));
		expect(bodyText().map((r) => r[0])).toEqual(['Alex', 'Maria']);
		await user.click(screen.getByRole('button', { name: 'Name' }));
		expect(bodyText().map((r) => r[0])).toEqual(['Maria', 'Alex']);
	});
});
