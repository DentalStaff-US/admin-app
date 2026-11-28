<script lang="ts">
	// Legacy syntax on purpose: formsnap 0.4's Form.Root hands out its config
	// and state through let: directives.
	import { Loader2 } from 'lucide-svelte';
	import type { SuperValidated } from 'sveltekit-superforms';
	import Notice from '$dtss/Notice.svelte';
	import Page from '$dtss/Page.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';
	import Section from '$dtss/Section.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Form from '$lib/components/ui/form';
	import { userSchema } from '$lib/config/zod-schemas';

	export let data: any;

	const profileSchema = userSchema.pick({
		firstName: true,
		lastName: true,
		email: true
	});

	type ProfileSchema = typeof profileSchema;

	export let form: SuperValidated<ProfileSchema>;
	form = data.form;
</script>

<Page width="narrow">
	<PageHeader title="Profile" description="Your name and sign-in email." />

	<Form.Root method="POST" {form} schema={profileSchema} let:config let:submitting let:errors>
		<Section title="Your details">
			<div class="space-y-5">
				{#if errors?._errors?.length}
					<Notice tone="negative" alert>{errors._errors.join(' ')}</Notice>
				{/if}
				<div class="grid gap-5 sm:grid-cols-2">
					<Form.Field {config} name="firstName">
						<Form.Item>
							<Form.Label class="font-semibold">First name</Form.Label>
							<Form.Input autocomplete="given-name" />
							<Form.Validation />
						</Form.Item>
					</Form.Field>
					<Form.Field {config} name="lastName">
						<Form.Item>
							<Form.Label class="font-semibold">Last name</Form.Label>
							<Form.Input autocomplete="family-name" />
							<Form.Validation />
						</Form.Item>
					</Form.Field>
				</div>
				<Form.Field {config} name="email">
					<Form.Item>
						<Form.Label class="font-semibold">Sign-in email</Form.Label>
						<Form.Input type="email" autocomplete="email" />
						<Form.Description>Changing it sends a verification link to the new address.</Form.Description>
						<Form.Validation />
					</Form.Item>
				</Form.Field>
				<div class="flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:justify-between">
					<Button href="/auth/password/reset" variant="outline">Change your password</Button>
					<Form.Button disabled={submitting}>
						{#if submitting}<Loader2 class="mr-2 size-4 animate-spin" aria-hidden="true" />Saving…{:else}Update profile{/if}
					</Form.Button>
				</div>
			</div>
		</Section>
	</Form.Root>
</Page>
