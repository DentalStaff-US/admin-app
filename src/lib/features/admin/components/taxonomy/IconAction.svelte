<script lang="ts">
	// Legacy syntax on purpose: bits-ui 0.x exposes the tooltip trigger through
	// let:builder (same as dtss/Hint.svelte).
	import { Tooltip } from 'bits-ui';
	import { Button } from '$lib/components/ui/button';
	import { cn } from '$lib/utils';

	/** The button's name: its aria-label and its tooltip. */
	export let label: string;
	export let icon: any;
	export let type: 'button' | 'submit' = 'button';
	export let disabled = false;
	/** Red icon for the first click of a destructive flow (the ConfirmDialog follows). */
	export let destructive = false;
</script>

<!-- Icon-only buttons get their name as a tooltip after 500ms (03 › Tooltip). -->
<Tooltip.Root openDelay={500} closeOnPointerDown={false}>
	<Tooltip.Trigger asChild let:builder>
		<Button
			builders={[builder]}
			{type}
			{disabled}
			variant="ghost"
			size="icon"
			aria-label={label}
			class={cn('size-9', destructive && 'text-destructive hover:bg-destructive/10 hover:text-destructive')}
			on:click
		>
			<svelte:component this={icon} class="size-4" aria-hidden="true" />
		</Button>
	</Tooltip.Trigger>
	<Tooltip.Content
		sideOffset={6}
		class="z-50 max-w-64 rounded-md bg-navy px-2.5 py-1.5 text-xs font-semibold leading-snug text-white shadow-float"
	>
		{label}
	</Tooltip.Content>
</Tooltip.Root>
