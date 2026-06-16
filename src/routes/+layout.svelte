<script lang="ts">
	import type { LayoutData } from './$types';
	import '../app.pcss';
	import { page, updated } from '$app/stores';
	import { beforeNavigate } from '$app/navigation';
	import { ModeWatcher } from 'mode-watcher';
	import { getFlash } from 'sveltekit-flash-message';
	import { Toaster } from '$lib/components/ui/sonner';
	import { toast } from 'svelte-sonner';
	import posthog from 'posthog-js';
	import { browser } from '$app/environment';

	export let data: any;
	let user: LayoutData['user'];
	$: user = data.user;

	$: if (browser && user) {
		posthog.identify(user.id, { role: user.role });
	} else if (browser && !user) {
		posthog.reset();
	}

	const flash = getFlash(page);
	$: console.log('+layout.svelte root flash: ' + JSON.stringify($flash));
	$: if ($flash) {
		switch ($flash.type) {
			case 'success':
				console.log('flash.message.success: ' + $flash.message);
				toast.success($flash.message);
				break;
			case 'error':
				console.log('flash.message.error: ' + $flash.message);
				toast.error($flash.message);
				break;
		}
	}
	import { setMode } from 'mode-watcher';
	setMode("light");

	// If a newer deploy has shipped while this tab was open, do a full-page load on
	// the next navigation instead of a client-side one. The fresh HTML references
	// the current immutable asset hashes, so we never try to preload a CSS/JS chunk
	// from the previous build that this container no longer serves.
	beforeNavigate((nav) => {
		if ($updated && nav.to?.url && !nav.willUnload) {
			nav.cancel();
			window.location.href = nav.to.url.href;
		}
	});
</script>

<ModeWatcher defaultMode="light" />
<Toaster richColors />
<div class="relative flex min-h-screen flex-col overflow-hidden">
	<slot />
</div>
