<script lang="ts">
	import * as Select from '$lib/components/ui/select';

	type Option = { value: string; label: string };

	let {
		name,
		id,
		options,
		value = $bindable(''),
		placeholder = 'Select…',
		disabled = false,
		class: className = '',
		onchange
	}: {
		/** Posted as a hidden input, so this works in a plain form (GET or POST). */
		name: string;
		id?: string;
		options: Option[];
		value?: string;
		placeholder?: string;
		disabled?: boolean;
		class?: string;
		onchange?: (value: string) => void;
	} = $props();

	const selected = $derived(options.find((o) => o.value === value));
</script>

<!-- A shadcn Select that submits like a native <select> (bits-ui 0.x Select.Input). -->
<Select.Root
	{selected}
	{disabled}
	onSelectedChange={(s) => {
		value = (s?.value as string | undefined) ?? '';
		onchange?.(value);
	}}
>
	<Select.Trigger {id} class={className}>
		<Select.Value {placeholder} />
	</Select.Trigger>
	<Select.Content>
		{#each options as option (option.value)}
			<Select.Item value={option.value} label={option.label}>{option.label}</Select.Item>
		{/each}
	</Select.Content>
	<Select.Input {name} />
</Select.Root>
