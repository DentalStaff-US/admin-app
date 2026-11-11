<script lang="ts">
	import { getFormField } from 'formsnap';
	import type { Writable } from 'svelte/store';
	import PhoneInput from '$lib/components/PhoneInput.svelte';

	/**
	 * PhoneInput as a formsnap control: use inside <Form.Field> like Form.Input.
	 * The field's label, aria wiring and validation come from the field context.
	 */
	let { placeholder }: { placeholder?: string } = $props();
	const field = getFormField();
	const attrs = field.attrStore;
	const value = field.value as Writable<string | null | undefined>;
</script>

<PhoneInput
	id={String($attrs.id ?? '')}
	name={String($attrs.name ?? '')}
	bind:value={$value}
	{placeholder}
	class={$attrs['aria-invalid'] ? 'border-destructive' : ''}
/>
