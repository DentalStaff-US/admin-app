<script lang="ts">
	import type { LayoutData } from './$types';
	import '../app.pcss';
	import { page } from '$app/stores';
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
</script>

<ModeWatcher />
<Toaster richColors />
<div class="relative flex min-h-screen flex-col overflow-hidden">
	<slot />
</div>
