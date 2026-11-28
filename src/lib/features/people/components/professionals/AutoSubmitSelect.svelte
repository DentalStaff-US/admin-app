<script lang="ts">
	import { tick } from 'svelte';
	import { enhance } from '$app/forms';
	import * as Select from '$lib/components/ui/select';

	type Option = { value: string; label: string; group?: string };

	/**
	 * One field of a document row that saves as soon as it changes (the
	 * documents table's inline editing), as a shadcn Select instead of a native
	 * <select>. Posts `documentId` plus `name=value` to the action.
	 */
	let {
		action,
		documentId,
		name,
		value,
		options,
		label,
		placeholder = '—'
	}: {
		action: string;
		documentId: string;
		name: string;
		value: string;
		options: Option[];
		/** Accessible name, e.g. "Type of license.pdf". */
		label: string;
		placeholder?: string;
	} = $props();

	let current = $state('');
	let formEl: HTMLFormElement | undefined = $state();
	$effect(() => {
		current = value;
	});

	const selected = $derived(options.find((o) => o.value === current));
	const groups = $derived([...new Set(options.map((o) => o.group ?? ''))]);

	async function change(next: string) {
		if (next === current) return;
		current = next;
		await tick();
		formEl?.requestSubmit();
	}
</script>

<form method="POST" {action} bind:this={formEl} use:enhance>
	<input type="hidden" name="documentId" value={documentId} />
	<input type="hidden" {name} value={current} />
	<Select.Root
		selected={selected ? { value: selected.value, label: selected.label } : { value: '', label: placeholder }}
		onSelectedChange={(v) => change((v?.value as string) ?? '')}
	>
		<Select.Trigger class="h-9 min-w-28" aria-label={label}><Select.Value placeholder={placeholder} /></Select.Trigger>
		<Select.Content>
			{#each groups as group (group)}
				{#if group}<Select.Label>{group}</Select.Label>{/if}
				{#each options.filter((o) => (o.group ?? '') === group) as option (option.value)}
					<Select.Item value={option.value}>{option.label}</Select.Item>
				{/each}
			{/each}
		</Select.Content>
	</Select.Root>
</form>
