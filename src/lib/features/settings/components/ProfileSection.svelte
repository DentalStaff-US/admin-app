<script lang="ts">
	import { Loader2 } from 'lucide-svelte';
	import { superForm } from 'sveltekit-superforms/client';
	import { writable } from 'svelte/store';
	import Section from '$dtss/Section.svelte';
	import AvatarUpload from '$lib/components/avatar-upload.svelte';
	import PhoneInput from '$lib/components/PhoneInput.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { firstError } from '../forms';
	import Field from './Field.svelte';
	import SettingsPanel from './SettingsPanel.svelte';

	let {
		user,
		userProfileForm,
		profileForm = null,
		onAvatarUpdated
	}: {
		user: any;
		userProfileForm: any;
		/** Practice owners and staff also keep a phone number on their profile. */
		profileForm?: any;
		onAvatarUpdated: (url: string, isForUser?: boolean) => void | Promise<void>;
	} = $props();

	// svelte-ignore state_referenced_locally
	const { form, errors, enhance, submitting } = superForm(userProfileForm);
	// svelte-ignore state_referenced_locally
	const showPhone = Boolean(profileForm);
	// svelte-ignore state_referenced_locally
	const phone = profileForm ? superForm(profileForm).form : writable({ cell_phone: '' });
</script>

<SettingsPanel title="Profile" description="How you appear to your team and to DTSS.">
	<form method="POST" action="?/updateUser" use:enhance>
		<Section title="Your details">
			<div class="space-y-6">
				<AvatarUpload {user} company={null} onAvatarUpdated={onAvatarUpdated} isForUser={true} />
				<div class="grid gap-4 sm:grid-cols-2">
					<Field id="firstName" label="First name" error={$errors.firstName}>
						<Input id="firstName" name="firstName" autocomplete="given-name" bind:value={$form.firstName} aria-invalid={$errors.firstName ? 'true' : undefined} />
					</Field>
					<Field id="lastName" label="Last name" error={$errors.lastName}>
						<Input id="lastName" name="lastName" autocomplete="family-name" bind:value={$form.lastName} aria-invalid={$errors.lastName ? 'true' : undefined} />
					</Field>
					<Field
						id="email"
						label="Sign-in email"
						description="Changing it sends a verification link to the new address."
						error={$errors.email}
						class="sm:col-span-2"
					>
						<Input id="email" name="email" type="email" autocomplete="email" bind:value={$form.email} aria-invalid={$errors.email ? 'true' : undefined} />
					</Field>
					{#if showPhone}
						<Field id="cell_phone" label="Mobile phone">
							<PhoneInput id="cell_phone" name="cell_phone" bind:value={$phone.cell_phone} />
						</Field>
					{/if}
				</div>
				{#if firstError($errors._errors)}
					<p class="text-sm text-destructive" role="alert">{firstError($errors._errors)}</p>
				{/if}
				<div class="flex justify-end border-t pt-4">
					<Button type="submit" disabled={$submitting}>
						{#if $submitting}<Loader2 class="mr-2 size-4 animate-spin" aria-hidden="true" />Saving…{:else}Save profile{/if}
					</Button>
				</div>
			</div>
		</Section>
	</form>
</SettingsPanel>
