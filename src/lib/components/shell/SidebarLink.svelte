<script lang="ts">
	// Legacy syntax on purpose: bits-ui 0.x exposes the tooltip trigger through
	// let:builder (same as dtss/Hint). Move to snippets with bits-ui 2.
	import type { ComponentType } from 'svelte';
	import { Tooltip } from 'bits-ui';
	import { cn } from '$lib/utils';

	export let href: string;
	export let label: string;
	export let icon: ComponentType;
	export let current = false;
	export let rail = false;
	export let count = 0;
	export let onNavigate: (() => void) | undefined = undefined;

	$: countLabel = count > 99 ? '99+' : String(count);
	$: classes = cn(
		'relative flex h-10 items-center gap-3 rounded-md px-3 text-sm font-semibold text-white/75 transition-colors duration-fast hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70',
		rail && 'justify-center px-0',
		current && 'bg-white/10 text-white'
	);
	$: ariaLabel = rail ? (count > 0 ? `${label}, ${count} unread` : label) : undefined;
</script>

{#if rail}
	<Tooltip.Root openDelay={150} closeOnPointerDown={false}>
		<Tooltip.Trigger asChild let:builder>
			<a
				{href}
				{...builder}
				use:builder.action
				aria-current={current ? 'page' : undefined}
				aria-label={ariaLabel}
				class={classes}
				on:click={() => onNavigate?.()}
			>
				{#if current}<span class="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-primary" aria-hidden="true"></span>{/if}
				<span class="relative shrink-0">
					<svelte:component this={icon} class="size-5" aria-hidden="true" />
					{#if count > 0}
						<span class="absolute -right-1.5 -top-1.5 size-2.5 rounded-full bg-primary ring-2 ring-navy" aria-hidden="true"></span>
					{/if}
				</span>
			</a>
		</Tooltip.Trigger>
		<Tooltip.Content
			side="right"
			sideOffset={8}
			class="z-50 rounded-md bg-navy px-2.5 py-1.5 text-xs font-semibold text-white shadow-float ring-1 ring-white/10"
		>
			{label}
		</Tooltip.Content>
	</Tooltip.Root>
{:else}
	<a {href} aria-current={current ? 'page' : undefined} class={classes} on:click={() => onNavigate?.()}>
		{#if current}<span class="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-primary" aria-hidden="true"></span>{/if}
		<svelte:component this={icon} class="size-5 shrink-0" aria-hidden="true" />
		<span class="flex-1 truncate">{label}</span>
		{#if count > 0}
			<span class="rounded-full bg-primary px-2 text-xs font-bold leading-5 text-white">
				{countLabel}<span class="sr-only"> unread</span>
			</span>
		{/if}
	</a>
{/if}
