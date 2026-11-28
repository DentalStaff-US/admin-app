import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://kit.svelte.dev/docs/integrations#preprocessors
	// for more information about preprocessors
	preprocess: [vitePreprocess({})],

	kit: {
		adapter: adapter(),
		alias: {
			$ui: 'src/lib/components/ui',
			$dtss: 'src/lib/components/dtss',
			$shell: 'src/lib/components/shell',
			$features: 'src/lib/features',
			$tokens: 'src/lib/design-tokens'
		},
		version: {
			pollInterval: 60000
		}
	}
};

export default config;
