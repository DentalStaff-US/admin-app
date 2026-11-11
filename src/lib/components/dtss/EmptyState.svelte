<script lang="ts">
	import type { Snippet } from 'svelte';
	import IconSquare from './IconSquare.svelte';

	let {
		icon,
		title,
		description,
		children
	}: { icon: any; title: string; description: string; children?: Snippet } = $props();
</script>

<div class="flex flex-col items-center rounded-xl border border-dashed bg-muted/30 px-6 py-10 text-center">
	<IconSquare {icon} />
	<h3 class="mt-4 text-h3">{title}</h3>
	<p class="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
	{#if children}
		<div class="mt-6 flex flex-wrap justify-center gap-3">{@render children()}</div>
	{/if}
</div>
