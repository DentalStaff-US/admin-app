import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://kit.svelte.dev/docs/integrations#preprocessors
	// for more information about preprocessors
	preprocess: [vitePreprocess({})],

	kit: {
		adapter: adapter(),
		// Required for PostHog session replay to work correctly with SSR
		paths: {
			relative: false
		},
		// Poll for new deploys every 60s. When a new build is detected the `updated`
		// store flips true; the root layout then forces a full page load on the next
		// navigation so the browser fetches fresh asset hashes instead of trying to
		// preload immutable chunks from a prior deploy that no longer exist (the
		// "Unable to preload CSS" 500s).
		version: {
			pollInterval: 60000
		}
	}
};

export default config;
