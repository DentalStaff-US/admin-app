import { sveltekit } from '@sveltejs/kit/vite';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineConfig } from 'vitest/config';

// Single config, path-based environment switching:
// - Tests under src/lib/server, src/cron, and *.server.test.ts run in node
// - Everything else defaults to jsdom (so component tests get a DOM)
//
// The `svelteTesting` plugin swaps Svelte's export condition to `browser` so
// reactivity & lifecycle hooks actually fire during component tests — without
// it, components mount in SSR mode and on:click etc. silently no-op.
export default defineConfig({
	plugins: [sveltekit(), svelteTesting()],
	test: {
		environment: 'jsdom',
		environmentMatchGlobs: [
			['src/lib/server/**', 'node'],
			['src/cron/**', 'node'],
			['**/*.server.test.ts', 'node']
		],
		setupFiles: ['./src/test-setup.ts'],
		include: [
			'src/**/*.test.ts',
			'src/**/*.test.svelte.ts',
			'src/routes/**/*.server.test.ts'
		],
		exclude: ['node_modules/**', '.svelte-kit/**']
	}
});
