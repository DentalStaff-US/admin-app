import preset from './src/lib/design-tokens/tailwind-preset.cjs';

/** @type {import('tailwindcss').Config} */
const config = {
	presets: [preset],
	// Dark mode is disabled. Using 'class' (not the default 'media') means
	// flowbite-svelte's built-in `dark:` utilities only apply when a `.dark` class
	// is present — which we never add — instead of reacting to the user's OS
	// prefers-color-scheme. This is what was turning the UI dark (white buttons)
	// for users whose OS is in dark mode.
	darkMode: 'class',
	content: [
		'./src/**/*.{html,js,svelte,ts}',
		'./node_modules/flowbite-svelte/**/*.{html,js,svelte,ts}'
	],
	plugins: [
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		require('flowbite/plugin')({
			charts: true
		})
	]
};

export default config;
