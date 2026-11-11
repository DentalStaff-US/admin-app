import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import SvelteTableFixture from './SvelteTableFixture.svelte';

describe('svelte-table shim on the server', () => {
	it('server-renders text and bound component cells', () => {
		const { body } = render(SvelteTableFixture, {
			props: { rows: [{ name: 'Maria', status: 'PENDING', hours: 8 }] }
		});
		const text = body.replace(/<!--[\s\S]*?-->/g, '');
		expect(text).toContain('>Name<');
		expect(text).toContain('>Maria<');
		expect(text).toContain('8 hrs');
		expect(text).toMatch(/<span[^>]*>PENDING<\/span>/);
	});
});
