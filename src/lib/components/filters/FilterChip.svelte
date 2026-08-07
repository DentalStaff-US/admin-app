<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { X } from 'lucide-svelte';
	import { badgeVariants, type Variant } from '$lib/components/ui/badge';
	import { cn } from '$lib/utils';

	/** Dimension name shown before the value, e.g. "State". Optional. */
	export let label: string | null = null;
	export let value: string;
	export let variant: Variant = 'secondary';
	export let removable = true;

	let className: string | undefined = undefined;
	export { className as class };

	const dispatch = createEventDispatcher<{ remove: void }>();
</script>

<!--
	The shared Badge component renders a `value` prop and exposes no slot, so a
	dismissible chip has to be composed from badgeVariants() directly.
-->
<span
	class={cn(
		badgeVariants({ variant }),
		'max-w-full gap-1 font-normal',
		removable ? 'pr-1' : 'pr-2.5',
		className
	)}
>
	{#if label}
		<span class="shrink-0 font-semibold">{label}:</span>
	{/if}
	<span class="truncate">{value}</span>
	{#if removable}
		<button
			type="button"
			class="ml-0.5 shrink-0 rounded-full p-0.5 opacity-70 transition hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
			aria-label={label ? `Remove ${label} filter ${value}` : `Remove filter ${value}`}
			on:click|stopPropagation={() => dispatch('remove')}
		>
			<X class="h-3 w-3" />
		</button>
	{/if}
</span>
