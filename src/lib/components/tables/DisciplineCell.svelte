<script lang="ts">
	import * as Tooltip from '$lib/components/ui/tooltip/';
	import { badgeVariants } from '$lib/components/ui/badge';
	import { cn } from '$lib/utils';
	import type { DisciplineSummary } from '$lib/_helpers/professional-filters';

	export let disciplines: DisciplineSummary[] = [];
	/** Discipline ids matching the active filter — highlighted so the match is obvious. */
	export let highlightIds: string[] = [];
	export let max = 2;

	$: highlighted = new Set(highlightIds);
	$: visible = disciplines.slice(0, max);
	$: overflow = disciplines.slice(max);
</script>

{#if !disciplines.length}
	<span class="text-muted-foreground">—</span>
{:else}
	<div class="flex flex-wrap items-center gap-1">
		{#each visible as discipline (discipline.id)}
			<Tooltip.Root openDelay={200}>
				<Tooltip.Trigger asChild let:builder>
					<span
						use:builder.action
						{...builder}
						class={cn(
							badgeVariants({ variant: highlighted.has(discipline.id) ? 'default' : 'secondary' }),
							'font-medium'
						)}
					>
						{discipline.abbreviation || discipline.name}
					</span>
				</Tooltip.Trigger>
				<Tooltip.Content>
					<p>{discipline.name}</p>
				</Tooltip.Content>
			</Tooltip.Root>
		{/each}

		{#if overflow.length}
			<Tooltip.Root openDelay={200}>
				<Tooltip.Trigger asChild let:builder>
					<span
						use:builder.action
						{...builder}
						class={cn(
							badgeVariants({
								variant: overflow.some((entry) => highlighted.has(entry.id))
									? 'default'
									: 'outline'
							}),
							'font-medium'
						)}
					>
						+{overflow.length}
					</span>
				</Tooltip.Trigger>
				<Tooltip.Content>
					<p>{overflow.map((entry) => entry.name).join(', ')}</p>
				</Tooltip.Content>
			</Tooltip.Root>
		{/if}
	</div>
{/if}
