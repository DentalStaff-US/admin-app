<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import * as Form from '$lib/components/ui/form';
	import * as Alert from '$lib/components/ui/alert';
	import {
		clientCompanySchema,
		clientProfileSchema,
		type ClientCompanySchema
	} from '$lib/config/zod-schemas';
	import { Loader2, AlertCircle } from 'lucide-svelte';
	import type { SuperValidated } from 'sveltekit-superforms';

	export let form: SuperValidated<ClientCompanySchema>;

	const companySchema = clientCompanySchema.pick({
		companyName: true
	});
	const clientSchema = clientProfileSchema.pick({
		cell_phone: true
	})
	const mergedSchema = companySchema.merge(clientSchema)

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

<section class="flex flex-col items-center justify-center min-h-screen">
	<div class="p-6 flex gap-2 w-full max-w-2xl mx-auto">
		<Form.Root
			class="w-full"
			let:submitting
			let:errors
			method="POST"
			{form}
			schema={mergedSchema}
			let:config
			on:submit={(e) => {
				console.log('Submit event triggered', e);
				console.log('Form data:', e.detail);
			}}
		>
			<Card.Root>
				<Card.Header>
					<Card.Title class="text-2xl">Company Info</Card.Title>
					<Card.Description>Let's get your company profile set up.</Card.Description>
				</Card.Header>
				<Card.Content>
					{#if errors?._errors?.length}
						<Alert.Root variant="destructive">
							<AlertCircle class="h-4 w-4" />
							<Alert.Title>Error</Alert.Title>
							<Alert.Description>
								{#each errors._errors as error}
									{error}
								{/each}
							</Alert.Description>
						</Alert.Root>
					{/if}
					<Form.Field {config} name="companyName">
						<Form.Item>
							<Form.Label>Company Name</Form.Label>
							<Form.Input />
							<Form.Validation />
						</Form.Item>
					</Form.Field>
					<Form.Field {config} name="cell_phone">
						<Form.Item>
							<Form.Label>Phone number</Form.Label>
							<Form.Input
								type="tel"
								inputmode="numeric"
								placeholder="(555) 555-5555"
								on:input={maskPhone}
							/>
							<Form.Validation />
						</Form.Item>
					</Form.Field>
				</Card.Content>
				<Card.Footer>
					<Form.Button class="ml-auto" disabled={submitting}
						>{#if submitting}
							<Loader2 class="mr-2 h-4 w-4 animate-spin" />
						{:else}Next{/if}
					</Form.Button>
				</Card.Footer>
			</Card.Root>
		</Form.Root>
	</div>
</section>
