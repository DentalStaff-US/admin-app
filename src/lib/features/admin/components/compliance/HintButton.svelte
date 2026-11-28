<script lang="ts">
	// Legacy syntax on purpose: bits-ui 0.x exposes the tooltip trigger through
	// let:builder (same as dtss/Hint.svelte).
	import { Tooltip } from 'bits-ui';
	import { Button } from '$lib/components/ui/button';

	/** What the action does, or why it's disabled (03 › Tooltip copy rules). */
	export let hint: string;
	export let type: 'button' | 'submit' = 'button';
	export let disabled = false;
	export let variant: 'outline' | 'ghost' | 'default' = 'outline';
</script>

<!-- A disabled button fires no pointer events, so the trigger is a focusable
     wrapper; the hint still opens on hover and on keyboard focus. -->
<Tooltip.Root openDelay={1000} closeOnPointerDown={false}>
	<Tooltip.Trigger asChild let:builder>
		{#if disabled}
			<!-- svelte-ignore a11y-no-noninteractive-tabindex -->
			<span {...builder} use:builder.action tabindex="0" class="inline-flex rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
				<Button {type} size="sm" {variant} disabled><slot /></Button>
			</span>
		{:else}
			<Button builders={[builder]} {type} size="sm" {variant} on:click><slot /></Button>
		{/if}
	</Tooltip.Trigger>
	<Tooltip.Content
		sideOffset={6}
		class="z-50 max-w-64 rounded-md bg-navy px-2.5 py-1.5 text-xs font-semibold leading-snug text-white shadow-float"
	>
		{hint}
	</Tooltip.Content>
</Tooltip.Root>
