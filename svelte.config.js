import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://kit.svelte.dev/docs/integrations#preprocessors
	// for more information about preprocessors
	preprocess: [vitePreprocess({})],

	kit: {
		adapter: adapter(),
		// Do NOT set `paths.relative: false`. With adapter-node it makes SvelteKit's
		// CSS modulepreload resolve asset URLs relative to the entry-chunk directory,
		// producing a doubled path — /_app/immutable/entry/_app/immutable/assets/X.css
		// — which 404s → "Unable to preload CSS" → the page dies on hydration. The
		// default (relative: true) is what the professional app uses, and it works.
		// (It was added 2026-04-30 for PostHog session replay, which is disabled, and
		// the candidate app proves PostHog works fine without it.)
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
