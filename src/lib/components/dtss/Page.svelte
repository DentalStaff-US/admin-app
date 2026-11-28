<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	let {
		width = 'default',
		class: className,
		children
	}: {
		/** `full` for wide tables, the coverage board and the calendar. */
		width?: 'default' | 'narrow' | 'full';
		class?: string;
		children: Snippet;
	} = $props();
</script>

<!-- 03 › Page: the shell owns no padding, so every page gets the same gutter here. -->
<div
	class={cn(
		'mx-auto w-full space-y-6 px-4 py-6 md:px-8 md:py-8',
		width === 'default' && 'max-w-7xl',
		width === 'narrow' && 'max-w-3xl',
		className
	)}
>
	{@render children()}
</div>
