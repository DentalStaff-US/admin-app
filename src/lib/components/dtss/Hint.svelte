<script lang="ts">
	// Legacy syntax on purpose: bits-ui 0.x exposes its trigger through let:builder.
	// Move to snippets when ui/ is regenerated on bits-ui 2.
	import { Tooltip } from 'bits-ui';
	import { cn } from '$lib/utils';

	export let text: string;
	let className = '';
	export { className as class };
</script>

<!-- Hover intent of a second; keyboard users get the same text on focus. -->
<Tooltip.Root openDelay={1000} closeOnPointerDown={false}>
	<Tooltip.Trigger asChild let:builder>
		<!-- svelte-ignore a11y-no-noninteractive-tabindex -->
		<span
			{...builder}
			use:builder.action
			tabindex="0"
			class={cn('rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring', className)}
		>
			<slot />
		</span>
	</Tooltip.Trigger>
	<Tooltip.Content
		sideOffset={6}
		class="z-50 max-w-64 rounded-md bg-navy px-2.5 py-1.5 text-xs font-semibold leading-snug text-white shadow-float"
	>
		{text}
	</Tooltip.Content>
</Tooltip.Root>
