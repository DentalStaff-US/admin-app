<script lang="ts">
	import { enhance } from '$app/forms';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Label } from '$lib/components/ui/label';
	import Notice from '$dtss/Notice.svelte';

	/**
	 * Declare (or remove) a certification requirement on one Experience & Rates
	 * entry: a one-field form, so a Dialog. Posts to the existing
	 * `updateDisciplineCertification` action. There's no date field on purpose:
	 * the expiry is the linked CERTIFICATE document's, which is what the gate
	 * reads, and every save clears the legacy column so the two can't disagree.
	 */
	let {
		open = $bindable(false),
		disciplineId,
		disciplineName,
		requiresCert,
		hasCertDocument,
		action = '?/updateDisciplineCertification'
	}: {
		open?: boolean;
		disciplineId: string;
		disciplineName: string;
		requiresCert: boolean;
		hasCertDocument: boolean;
		action?: string;
	} = $props();

	let checked = $state(false);
	let saving = $state(false);
	$effect(() => {
		if (open) checked = requiresCert;
	});
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title class="text-h2">Certification for {disciplineName}</Dialog.Title>
			<Dialog.Description>Only staff can remove a declared certification.</Dialog.Description>
		</Dialog.Header>
		<form
			method="POST"
			{action}
			class="space-y-4"
			use:enhance={() => {
				saving = true;
				return async ({ update }) => {
					await update();
					saving = false;
					open = false;
				};
			}}
		>
			<input type="hidden" name="disciplineId" value={disciplineId} />
			<!-- A hidden field, not a bare checkbox: an unchecked box sends nothing,
			     which the action can't tell from "leave it alone". -->
			<input type="hidden" name="requiresCert" value={checked ? 'true' : 'false'} />
			<input type="hidden" name="certExpiresOn" value="" />
			<div class="flex items-start gap-3">
				<Checkbox id="requires-cert" bind:checked />
				<Label for="requires-cert" class="font-normal leading-snug">
					This professional's state requires a certification for {disciplineName}
				</Label>
			</div>
			{#if checked}
				<p class="text-sm text-muted-foreground">
					The expiry comes from their certification document for {disciplineName}; set or correct it in Documents.
				</p>
				{#if !hasCertDocument}
					<Notice tone="warning">No certification document is linked yet, so nothing is being tracked.</Notice>
				{/if}
			{:else if requiresCert}
				<Notice tone="warning">Saving removes the certification requirement. Professionals can't undo this themselves.</Notice>
			{/if}
			<Dialog.Footer class="gap-2">
				<Button variant="outline" on:click={() => (open = false)}>Cancel</Button>
				<Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
