<script lang="ts">
	import type { StatusTone } from '$tokens/status';
	import { TONE_CLASSES } from '$tokens/status';
	import { cn } from '$lib/utils';

	export type TabLink = {
		value: string;
		label: string;
		href: string;
		count?: number | null;
		/** Only when the count is a call to action (e.g. pending). Neutral otherwise. */
		tone?: StatusTone;
	};

	let { tabs, active, label }: { tabs: TabLink[]; active: string; label: string } = $props();
</script>

<!-- 03 › Tabs with counts. Links, so the tab is in the URL; scrolls sideways on phones. -->
<nav aria-label={label} class="-mb-px overflow-x-auto">
	<ul class="inline-flex h-10 items-center gap-1 rounded-md bg-muted p-1">
		{#each tabs as tab (tab.value)}
			{@const current = tab.value === active}
			<li>
				<a
					href={tab.href}
					aria-current={current ? 'page' : undefined}
					data-sveltekit-noscroll
					class={cn(
						'inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-sm px-3 text-sm font-semibold text-muted-foreground transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
						current && 'bg-background text-foreground shadow-card'
					)}
				>
					{tab.label}
					{#if tab.count !== null && tab.count !== undefined}
						<span
							class={cn(
								'rounded-full px-1.5 text-xs font-bold tabular-nums leading-5',
								tab.tone && tab.count > 0 ? cn('border', TONE_CLASSES[tab.tone]) : 'bg-background/70 text-muted-foreground',
								current && !tab.tone && 'bg-muted'
							)}
						>
							{tab.count}
						</span>
					{/if}
				</a>
			</li>
		{/each}
	</ul>
</nav>
