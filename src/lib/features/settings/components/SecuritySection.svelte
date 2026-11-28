<script lang="ts">
	import { Loader2 } from 'lucide-svelte';
	import { superForm } from 'sveltekit-superforms/client';
	import Notice from '$dtss/Notice.svelte';
	import Section from '$dtss/Section.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { firstError } from '../forms';
	import Field from './Field.svelte';
	import SettingsPanel from './SettingsPanel.svelte';
	import TwoFactorSettings from './TwoFactorSettings.svelte';

	let { passwordForm, twoFactorEnabled }: { passwordForm: any; twoFactorEnabled: boolean } = $props();

	// svelte-ignore state_referenced_locally
	const { form, errors, enhance, submitting } = superForm(passwordForm);
</script>

<SettingsPanel title="Password & security" description="Keep your account yours.">
	<form method="POST" action="?/updatePassword" use:enhance>
		<Section title="Password">
			<div class="max-w-md space-y-4">
				{#if firstError($errors.confirmPassword) || firstError($errors._errors)}
					<Notice tone="negative" alert>{firstError($errors.confirmPassword) ?? firstError($errors._errors)}</Notice>
				{/if}
				<Field id="password" label="Current password" error={$errors.password}>
					<Input id="password" type="password" name="password" autocomplete="current-password" bind:value={$form.password} />
				</Field>
				<Field id="newPassword" label="New password" error={$errors.newPassword}>
					<Input id="newPassword" type="password" name="newPassword" autocomplete="new-password" bind:value={$form.newPassword} />
				</Field>
				<Field id="confirmPassword" label="Confirm new password">
					<Input id="confirmPassword" type="password" name="confirmPassword" autocomplete="new-password" bind:value={$form.confirmPassword} />
				</Field>
			</div>
			<div class="mt-6 flex justify-end border-t pt-4">
				<Button type="submit" disabled={$submitting}>
					{#if $submitting}<Loader2 class="mr-2 size-4 animate-spin" aria-hidden="true" />Saving…{:else}Change password{/if}
				</Button>
			</div>
		</Section>
	</form>

	<TwoFactorSettings enabled={twoFactorEnabled} />
</SettingsPanel>
