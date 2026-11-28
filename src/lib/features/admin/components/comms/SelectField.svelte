<script lang="ts">
	// A single-value shadcn Select bound to a plain string, replacing native
	// <select>s (03 › Form controls). An option with value '' is the "Any" choice.
	import * as Select from '$lib/components/ui/select';
	import { cn } from '$lib/utils';

	export type SelectOption = { value: string; label: string };

	let {
		id,
		value = $bindable(''),
		options,
		placeholder = 'Any',
		label,
		class: className
	}: {
		id: string;
		value?: string | null;
		options: SelectOption[];
		placeholder?: string;
		/** Accessible name when there is no visible <Label for={id}>. */
		label?: string;
		class?: string;
	} = $props();

	const selected = $derived(options.find((o) => o.value === (value ?? '')));
</script>

<Select.Root
	selected={selected ? { value: selected.value, label: selected.label } : undefined}
	onSelectedChange={(next) => (value = (next?.value as string | undefined) ?? '')}
>
	<Select.Trigger {id} aria-label={label} class={cn('bg-background', className)}>
		<Select.Value {placeholder} />
	</Select.Trigger>
	<Select.Content class="max-h-72 overflow-y-auto">
		{#each options as option (option.value)}
			<Select.Item value={option.value} label={option.label}>{option.label}</Select.Item>
		{/each}
	</Select.Content>
</Select.Root>
