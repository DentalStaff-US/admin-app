<script lang="ts">
	import type { Snippet } from 'svelte';
	import { replaceState } from '$app/navigation';
	import { cn } from '$lib/utils';

	export type DetailTab = { value: string; label: string; count?: number | null };

	/**
	 * Detail-page tabs (03 › Tabs with counts). Switching is client-side, so the
	 * page's heavy load doesn't re-run, but the tab is mirrored into `?tab=`
	 * with a shallow replaceState so a link or refresh lands on the same tab.
	 * Scrolls sideways on phones rather than stacking.
	 */
	let {
		tabs,
		value = $bindable(),
		label,
		syncUrl = true,
		children
	}: {
		tabs: DetailTab[];
		value: string;
		label: string;
		syncUrl?: boolean;
		/** Renders the active panel; receives the active tab id. */
		children: Snippet<[string]>;
	} = $props();

	const id = `tabs-${Math.random().toString(36).slice(2, 8)}`;
	let buttons: HTMLButtonElement[] = $state([]);

	// Keep the active tab in view when the strip scrolls sideways on phones.
	$effect(() => {
		const index = tabs.findIndex((t) => t.value === value);
		buttons[index]?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
	});

	function select(next: string) {
		value = next;
		if (!syncUrl || typeof window === 'undefined') return;
		const url = new URL(window.location.href);
		if (next === tabs[0]?.value) url.searchParams.delete('tab');
		else url.searchParams.set('tab', next);
		try {
			replaceState(url, {});
		} catch {
			// Before the router is ready (e.g. in a fixture) the tab still switches.
		}
	}

	function onKeydown(event: KeyboardEvent, index: number) {
		const last = tabs.length - 1;
		const target =
			event.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
			: event.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
			: event.key === 'Home' ? 0
			: event.key === 'End' ? last
			: null;
		if (target === null) return;
		event.preventDefault();
		select(tabs[target].value);
		buttons[target]?.focus();
	}
</script>

<div class="space-y-6">
	<div class="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
		<div role="tablist" aria-label={label} class="inline-flex h-10 items-center gap-1 rounded-md bg-muted p-1">
			{#each tabs as tab, i (tab.value)}
				{@const current = tab.value === value}
				<button
					bind:this={buttons[i]}
					type="button"
					role="tab"
					id="{id}-{tab.value}"
					aria-selected={current}
					aria-controls="{id}-panel"
					tabindex={current ? 0 : -1}
					onclick={() => select(tab.value)}
					onkeydown={(e) => onKeydown(e, i)}
					class={cn(
						'inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-sm px-3 text-sm font-semibold text-muted-foreground transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
						current && 'bg-background text-foreground shadow-card'
					)}
				>
					{tab.label}
					{#if tab.count !== null && tab.count !== undefined}
						<span
							class={cn(
								'rounded-full px-1.5 text-xs font-bold tabular-nums leading-5 text-muted-foreground',
								current ? 'bg-muted' : 'bg-background/70'
							)}
						>
							{tab.count}
						</span>
					{/if}
				</button>
			{/each}
		</div>
	</div>
	<div role="tabpanel" id="{id}-panel" aria-labelledby="{id}-{value}" tabindex="-1" class="focus-visible:outline-none">
		{@render children(value)}
	</div>
</div>
