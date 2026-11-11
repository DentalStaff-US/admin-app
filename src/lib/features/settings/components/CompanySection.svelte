<script lang="ts">
	import { Loader2 } from 'lucide-svelte';
	import { superForm } from 'sveltekit-superforms/client';
	import Section from '$dtss/Section.svelte';
	import AvatarUpload from '$lib/components/avatar-upload.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { firstError } from '../forms';
	import Field from './Field.svelte';
	import OperatingHoursField from './OperatingHoursField.svelte';
	import SettingsPanel from './SettingsPanel.svelte';

	let {
		companyForm,
		company,
		onAvatarUpdated
	}: {
		companyForm: any;
		company: any;
		onAvatarUpdated: (url: string, isForUser?: boolean) => void | Promise<void>;
	} = $props();

	// svelte-ignore state_referenced_locally
	const { form, errors, enhance, submitting } = superForm(companyForm);
</script>

<SettingsPanel title="Practice" description="What professionals see about your practice.">
	<form method="POST" action="?/updateCompany" use:enhance class="space-y-6">
		<Section title="Practice details">
			<div class="space-y-6">
				<AvatarUpload user={null} {company} onAvatarUpdated={onAvatarUpdated} isForUser={false} />
				<div class="grid gap-4 sm:grid-cols-2">
					<Field id="companyName" label="Practice name" error={$errors.companyName} class="sm:col-span-2">
						<Input id="companyName" name="companyName" autocomplete="organization" bind:value={$form.companyName} />
					</Field>
					<Field id="companyDescription" label="About the practice" description="A few lines professionals read before they accept a shift." error={$errors.companyDescription} class="sm:col-span-2">
						<Textarea id="companyDescription" name="companyDescription" rows={4} bind:value={$form.companyDescription} />
					</Field>
					<Field id="baseLocation" label="Base location" error={$errors.baseLocation}>
						<Input id="baseLocation" name="baseLocation" bind:value={$form.baseLocation} />
					</Field>
					<Field id="website" label="Website" error={$errors.website}>
						<Input id="website" name="website" type="url" placeholder="https://example.com" bind:value={$form.website} />
					</Field>
				</div>
			</div>
		</Section>

		<Section title="Operating hours" description="The days and hours your practice is open.">
			<OperatingHoursField bind:value={$form.operatingHours} />
		</Section>

		{#if firstError($errors._errors)}
			<p class="text-sm text-destructive" role="alert">{firstError($errors._errors)}</p>
		{/if}
		<div class="flex justify-end">
			<Button type="submit" disabled={$submitting}>
				{#if $submitting}<Loader2 class="mr-2 size-4 animate-spin" aria-hidden="true" />Saving…{:else}Save practice{/if}
			</Button>
		</div>
	</form>
</SettingsPanel>
