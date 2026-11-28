<script lang="ts">
	import { superForm } from 'sveltekit-superforms/client';
	import Section from '$dtss/Section.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';

	/**
	 * The program's money settings. The marketing site's /api/public/program
	 * reads commission rate and payout minimum, so the action, field names and
	 * posted values are exactly what they were: commissionRate, payoutMinimum,
	 * and programEnabled posted as "on" only when checked (a native checkbox's
	 * wire format).
	 */
	let { form: settingsForm, canEdit }: { form: any; canEdit: boolean } = $props();

	const { form, errors, enhance, submitting } = superForm(settingsForm);
</script>

<Section
	title="Program settings"
	description="Rate changes are forward-only: commission already earned keeps the rate it was calculated with. This is separate from the platform fee charged to practices."
>
	<form method="POST" action="?/updateSettings" use:enhance class="grid max-w-xl gap-5">
		<div class="grid items-start gap-4 sm:grid-cols-2">
			<div class="grid gap-2">
				<Label for="commissionRate">Commission rate (%)</Label>
				<Input
					id="commissionRate"
					name="commissionRate"
					type="number"
					step="0.01"
					min="0"
					max="100"
					bind:value={$form.commissionRate}
					disabled={!canEdit}
					aria-invalid={$errors.commissionRate ? 'true' : undefined}
					class="tabular-nums"
				/>
				{#if $errors.commissionRate}<p class="text-sm text-destructive">{$errors.commissionRate}</p>{/if}
			</div>
			<div class="grid gap-2">
				<Label for="payoutMinimum">Payout minimum ($)</Label>
				<Input
					id="payoutMinimum"
					name="payoutMinimum"
					type="number"
					step="0.01"
					min="0"
					bind:value={$form.payoutMinimum}
					disabled={!canEdit}
					aria-invalid={$errors.payoutMinimum ? 'true' : undefined}
					class="tabular-nums"
				/>
				{#if $errors.payoutMinimum}
					<p class="text-sm text-destructive">{$errors.payoutMinimum}</p>
				{:else}
					<p class="text-sm text-muted-foreground">Balances below this roll forward to the next run.</p>
				{/if}
			</div>
		</div>

		<div class="flex items-center gap-2">
			<Checkbox id="programEnabled" bind:checked={$form.programEnabled} disabled={!canEdit} />
			<Label for="programEnabled">Program enabled</Label>
			{#if $form.programEnabled && canEdit}<input type="hidden" name="programEnabled" value="on" />{/if}
		</div>

		<div>
			{#if canEdit}
				<Button type="submit" disabled={$submitting}>{$submitting ? 'Saving…' : 'Save settings'}</Button>
			{:else}
				<p class="text-sm text-muted-foreground">Only a superadmin can change these.</p>
			{/if}
		</div>
	</form>
</Section>
