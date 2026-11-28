import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';
import { attachInboxHub } from './ws/hub.js';

export default defineConfig({
	plugins: [
		sveltekit(),
		{
			// In production server.js does this; adapter-node has no hook for it.
			name: 'inbox-socket',
			configureServer(server) {
				if (!server.httpServer) return;
				const env = loadEnv(server.config.mode, process.cwd(), '');
				attachInboxHub(server.httpServer, {
					secret: env.BETTER_AUTH_SECRET,
					databaseUrl: env.DATABASE_URL
				});
			}
		}
	],
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
