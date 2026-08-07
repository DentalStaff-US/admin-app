<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import FilterMultiSelect from './FilterMultiSelect.svelte';
	import FilterChip from './FilterChip.svelte';
	import type { FilterDimension } from './types';

	export let dimensions: FilterDimension[] = [];
	/** Rendered as its own chip so the search term is visible alongside filters. */
	export let searchTerm: string | null = null;

	const dispatch = createEventDispatcher<{
		change: { key: string; values: string[] };
		clearSearch: void;
		clearAll: void;
	}>();

	type ActiveChip = {
		dimensionKey: string;
		dimensionLabel: string;
		value: string;
		display: string;
	};

	$: activeChips = dimensions.flatMap<ActiveChip>((dimension) =>
		dimension.selected.map((value) => ({
			dimensionKey: dimension.key,
			dimensionLabel: dimension.label,
			value,
			// Facet lists can omit a selected value; fall back to the raw value.
			display: dimension.options.find((option) => option.value === value)?.label ?? value
		}))
	);

	$: hasActive = activeChips.length > 0 || Boolean(searchTerm);

	function removeChip(chip: ActiveChip) {
		const dimension = dimensions.find((entry) => entry.key === chip.dimensionKey);
		if (!dimension) return;
		dispatch('change', {
			key: chip.dimensionKey,
			values: dimension.selected.filter((value) => value !== chip.value)
		});
	}
</script>

<div class="flex flex-col gap-3">
	<div class="flex flex-wrap items-center gap-2">
		{#each dimensions as dimension (dimension.key)}
			<FilterMultiSelect
				label={dimension.label}
				options={dimension.options}
				selected={dimension.selected}
				on:change={(event) => dispatch('change', { key: dimension.key, values: event.detail.values })}
			/>
		{/each}
	</div>

	{#if hasActive}
		<div class="flex flex-wrap items-center gap-2">
			{#if searchTerm}
				<FilterChip label="Search" value={searchTerm} on:remove={() => dispatch('clearSearch')} />
			{/if}
			{#each activeChips as chip (`${chip.dimensionKey}:${chip.value}`)}
				<FilterChip
					label={chip.dimensionLabel}
					value={chip.display}
					on:remove={() => removeChip(chip)}
				/>
			{/each}
			<Button
				variant="ghost"
				size="sm"
				class="h-6 px-2 text-xs text-muted-foreground"
				on:click={() => dispatch('clearAll')}
			>
				Clear all
			</Button>
		</div>
	{/if}
</div>
