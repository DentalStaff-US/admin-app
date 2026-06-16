import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	ssr: {
		// Keep better-auth OUT of the SSR bundle. The app is pinned to zod v3
		// (sveltekit-superforms@1.x), but better-auth needs zod v4 (it nests its
		// own zod@4 and calls v4-only APIs like `.meta()`). Bundling collapses
		// better-auth's `zod` import to the app's v3 → "z.coerce.boolean(...).meta
		// is not a function" at build. Externalizing lets Node resolve
		// better-auth's nested zod@4 at runtime.
		external: ['better-auth', '@better-auth/core', '@better-auth/utils']
	}
});
