<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';
	import { firstError } from '../forms';

	let {
		id,
		label,
		description,
		error,
		class: className,
		children
	}: {
		id: string;
		label: string;
		description?: string;
		/** Any superforms error entry; the first message is shown. */
		error?: unknown;
		class?: string;
		children: Snippet;
	} = $props();

	const message = $derived(firstError(error));
</script>

<!-- 03 › Form controls: label, control, description, error. -->
<div class={cn('space-y-1.5', className)}>
	<label for={id} class="block text-sm font-semibold">{label}</label>
	{@render children()}
	{#if description}<p id={`${id}-description`} class="text-sm text-muted-foreground">{description}</p>{/if}
	{#if message}<p id={`${id}-error`} class="text-sm text-destructive">{message}</p>{/if}
</div>
