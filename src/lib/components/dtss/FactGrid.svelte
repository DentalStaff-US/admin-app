<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	export type Fact = { label: string; value?: string | number | null; cell?: Snippet };

	let { facts, columns = 4 }: { facts: Fact[]; columns?: 2 | 3 | 4 } = $props();
</script>

<!-- 03 › FactGrid: key facts at the top of a detail page. -->
<dl
	class={cn(
		'grid grid-cols-2 gap-3',
		columns === 3 && 'sm:grid-cols-3',
		columns === 4 && 'sm:grid-cols-4'
	)}
>
	{#each facts as fact (fact.label)}
		<div class="min-w-0 rounded-lg bg-muted p-3">
			<dt class="text-overline uppercase text-muted-foreground">{fact.label}</dt>
			<dd class="mt-1 truncate font-bold tabular-nums">
				{#if fact.cell}{@render fact.cell()}{:else}{fact.value ?? '—'}{/if}
			</dd>
		</div>
	{/each}
</dl>
