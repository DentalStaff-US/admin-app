import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import DataTableFixture from './DataTableFixture.svelte';

const rows = [
	{ id: 1, name: 'Maria', hours: 8 },
	{ id: 2, name: 'Alex', hours: 6 }
];

describe('DataTable', () => {
	it('makes each row a real link from its first cell, not a click handler', () => {
		render(DataTableFixture, { rows });
		const link = screen.getByRole('link', { name: 'Open Maria' });
		expect(link.getAttribute('href')).toBe('/people/1');
		expect(link.closest('td')).not.toBeNull();
		// Interactive cells stay usable above the stretched link.
		expect(screen.getByRole('button', { name: 'Menu 1' })).toBeTruthy();
	});

	it('marks the sorted column and links each sortable header', () => {
		render(DataTableFixture, { rows });
		const hours = screen.getByRole('columnheader', { name: /Hours/ });
		expect(hours.getAttribute('aria-sort')).toBe('ascending');
		expect(screen.getByRole('link', { name: /Name/ }).getAttribute('href')).toBe('?sort=name');
		expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeTruthy();
	});

	it('pages with links and says where you are', () => {
		render(DataTableFixture, { rows });
		expect(screen.getByText('Showing 1–2 of 3')).toBeTruthy();
		expect(screen.getByRole('link', { name: /Next/ }).getAttribute('href')).toBe('?page=2');
		expect(screen.getByText('Previous').closest('a')?.getAttribute('aria-disabled')).toBe('true');
	});

	it('shows the empty state and no pager when there are no rows', () => {
		render(DataTableFixture, { rows: [] });
		expect(screen.getByText('No people yet')).toBeTruthy();
		expect(screen.queryByText(/Showing/)).toBeNull();
		expect(screen.queryByRole('table')).toBeNull();
	});
});
