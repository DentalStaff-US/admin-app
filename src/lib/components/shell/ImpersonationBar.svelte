<script lang="ts">
	import { Loader2 } from 'lucide-svelte';

	let { name, email }: { name: string; email?: string | null } = $props();

	let exiting = $state(false);

	async function stop() {
		exiting = true;
		// Server endpoint so the exit is recorded in the ledger before the
		// admin's own session is restored.
		await fetch('/impersonation/stop', { method: 'POST' });
		// Full load: the session changes underneath every cached page.
		window.location.href = '/admin/menu/users';
	}
</script>

<!-- 05 › Shared rules: a full-width navy strip with a real exit button. -->
<!-- Sticky so it's never out of sight; the shell offsets its sticky parts by --top-banner. -->
<div class="sticky top-0 z-40 flex h-10 shrink-0 items-center justify-center gap-3 bg-navy px-4 text-sm text-white ring-1 ring-white/10" role="status">
	<span class="truncate">
		Viewing as <strong class="font-bold">{name}</strong>{#if email}<span class="hidden text-white/70 sm:inline">{` (${email})`}</span>{/if}
	</span>
	<button
		type="button"
		onclick={stop}
		disabled={exiting}
		class="flex h-7 items-center gap-1.5 rounded-md bg-white px-3 text-xs font-bold text-navy hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-60"
	>
		{#if exiting}<Loader2 class="size-3.5 animate-spin" aria-hidden="true" />{/if}
		Exit
	</button>
</div>
