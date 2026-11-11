<script lang="ts">
	// Legacy syntax on purpose: formsnap 0.4's Form.Root hands out its config
	// and state through let: directives.
	import { Loader2 } from 'lucide-svelte';
	import type { SuperValidated } from 'sveltekit-superforms';
	import Notice from '$dtss/Notice.svelte';
	import * as Form from '$lib/components/ui/form';
	import { clientCompanySchema, clientProfileSchema } from '$lib/config/zod-schemas';
	import StepCard from './StepCard.svelte';

	export let form: SuperValidated<any>;

	const companySchema = clientCompanySchema.pick({ companyName: true });
	const clientSchema = clientProfileSchema.pick({ cell_phone: true });
	const mergedSchema = companySchema.merge(clientSchema);

	// Mirrors $lib/components/PhoneInput.svelte's display rules so every
	// phone field across the app formats identically as the user types.
	function maskPhone(e: Event) {
		const target = e.currentTarget as HTMLInputElement;
		const digits = target.value.replace(/\D/g, '');
		const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
		const trimmed = local.slice(0, 10);
		if (trimmed.length === 0) target.value = '';
		else if (trimmed.length <= 3) target.value = `(${trimmed}`;
		else if (trimmed.length <= 6) target.value = `(${trimmed.slice(0, 3)}) ${trimmed.slice(3)}`;
		else target.value = `(${trimmed.slice(0, 3)}) ${trimmed.slice(3, 6)}-${trimmed.slice(6)}`;
	}
</script>

<Form.Root method="POST" {form} schema={mergedSchema} let:config let:submitting let:errors>
	<StepCard>
		{#if errors?._errors?.length}
			<Notice tone="negative" alert>{errors._errors.join(' ')}</Notice>
		{/if}
		<Form.Field {config} name="companyName">
			<Form.Item>
				<Form.Label class="font-semibold">Practice name</Form.Label>
				<Form.Input autocomplete="organization" />
				<Form.Description>As patients and professionals know it.</Form.Description>
				<Form.Validation />
			</Form.Item>
		</Form.Field>
		<Form.Field {config} name="cell_phone">
			<Form.Item>
				<Form.Label class="font-semibold">Your phone number</Form.Label>
				<Form.Input type="tel" inputmode="numeric" autocomplete="tel" placeholder="(555) 555-5555" on:input={maskPhone} />
				<Form.Validation />
			</Form.Item>
		</Form.Field>
		{#snippet footer()}
			<span class="hidden sm:block"></span>
			<Form.Button class="w-full sm:w-auto" disabled={submitting}>
				{#if submitting}<Loader2 class="mr-2 size-4 animate-spin" aria-hidden="true" />Saving…{:else}Continue{/if}
			</Form.Button>
		{/snippet}
	</StepCard>
</Form.Root>
