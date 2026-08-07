<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { Check, ChevronsUpDown } from 'lucide-svelte';
	import * as Popover from '$lib/components/ui/popover';
	import * as Command from '$lib/components/ui/command';
	import { Button } from '$lib/components/ui/button';
	import { cn } from '$lib/utils';
	import type { FilterOption } from './types';

	export let label: string;
	export let options: FilterOption[] = [];
	export let selected: string[] = [];
	export let placeholder: string | null = null;
	export let emptyText = 'No matches.';
	export let disabled = false;

	let open = false;

	const dispatch = createEventDispatcher<{ change: { values: string[] } }>();

	$: selectedSet = new Set(selected);

	/**
	 * Options are facet-derived, so a value that is currently selected can drop
	 * out of the list (it may have no rows under the other active filters).
	 * Keep it visible with a zero count so it stays removable from in here.
	 */
	$: visibleOptions = [
		...options,
		...selected
			.filter((value) => !options.some((option) => option.value === value))
			.map((value) => ({ value, label: value, count: 0 }))
	];

	function toggle(value: string) {
		const next = selectedSet.has(value)
			? selected.filter((entry) => entry !== value)
			: [...selected, value];
		dispatch('change', { values: next });
	}
</script>

<Popover.Root bind:open>
	<Popover.Trigger asChild let:builder>
		<Button
			builders={[builder]}
			variant="outline"
			role="combobox"
			size="sm"
			{disabled}
			aria-expanded={open}
			class="justify-between gap-2"
		>
			<span class="truncate">
				{label}{selected.length ? ` (${selected.length})` : ''}
			</span>
			<ChevronsUpDown class="h-4 w-4 shrink-0 opacity-50" />
		</Button>
	</Popover.Trigger>
	<Popover.Content class="w-[260px] max-h-[320px] overflow-auto p-0" align="start">
		<Command.Root>
			<Command.Input placeholder={placeholder ?? `Search ${label.toLowerCase()}...`} />
			<Command.Empty>{emptyText}</Command.Empty>
			<Command.Group>
				{#each visibleOptions as option (option.value)}
					<Command.Item
						value={option.label}
						onSelect={() => toggle(option.value)}
						class="flex items-center justify-between gap-2"
					>
						<div class="flex min-w-0 items-center">
							<Check
								class={cn(
									'mr-2 h-4 w-4 shrink-0',
									!selectedSet.has(option.value) && 'text-transparent'
								)}
							/>
							<span class="truncate">{option.label}</span>
						</div>
						{#if option.count !== undefined}
							<span class="shrink-0 text-xs text-muted-foreground">{option.count}</span>
						{/if}
					</Command.Item>
				{/each}
			</Command.Group>
		</Command.Root>
	</Popover.Content>
</Popover.Root>
