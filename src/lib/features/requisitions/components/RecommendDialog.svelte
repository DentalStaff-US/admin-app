<script lang="ts">
	import { enhance } from '$app/forms';
	import Notice from '$dtss/Notice.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';

	export type RecommendTarget = {
		candidateId: string;
		firstName: string | null;
		lastName: string | null;
		/** Warnings the admin should see before recommending. */
		belowExperience?: boolean;
		missingSkills?: boolean;
	};

	let { open = $bindable(false), target }: { open?: boolean; target: RecommendTarget | null } = $props();

	const NOTE_MAX = 2000;
	let note = $state('');
	let consent = $state(false);
	let submitting = $state(false);
	$effect(() => {
		if (open) {
			note = '';
			consent = false;
		}
	});
	const name = $derived(target ? `${target.firstName ?? ''} ${target.lastName ?? ''}`.trim() : '');
</script>

<!-- A short form, so a Dialog (03 › Which overlay). The server re-checks consent,
     the blacklist, duplicates and that the request is open. -->
<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title class="text-h2">Recommend {name}</Dialog.Title>
			<Dialog.Description>
				They'll appear in the practice's applicants as recommended by our team. The practice and the
				professional are both emailed; the professional isn't told which practice it is.
			</Dialog.Description>
		</Dialog.Header>
		{#if target}
			<form
				method="POST"
				action="?/recommendCandidate"
				class="space-y-4"
				use:enhance={() => {
					submitting = true;
					return async ({ result, update }) => {
						submitting = false;
						if (result.type === 'success') open = false;
						await update();
					};
				}}
			>
				<input type="hidden" name="candidateId" value={target.candidateId} />
				<input type="hidden" name="consent" value={consent ? 'true' : ''} />
				{#if target.belowExperience}
					<Notice tone="warning">Below the requisition's required experience level.</Notice>
				{/if}
				{#if target.missingSkills}
					<Notice tone="warning">Doesn't have every skill the requisition requires.</Notice>
				{/if}
				<div class="space-y-1.5">
					<Label for="recommend-note" class="font-semibold">
						Note to the practice <span class="font-normal text-muted-foreground">(optional, shown to them)</span>
					</Label>
					<Textarea
						id="recommend-note"
						name="note"
						bind:value={note}
						maxlength={NOTE_MAX}
						placeholder="Why they're a good fit: availability, skills, what you learned vetting them…"
						class="min-h-24"
					/>
				</div>
				<div class="flex items-start gap-3">
					<Checkbox id="recommend-consent" checked={consent} onCheckedChange={(v) => (consent = v === true)} class="mt-0.5" />
					<Label for="recommend-consent" class="text-sm font-normal leading-snug">
						The professional agreed to be put forward for this role.
					</Label>
				</div>
				<Dialog.Footer class="gap-2">
					<Button type="button" variant="outline" on:click={() => (open = false)}>Cancel</Button>
					<Button type="submit" disabled={!consent || submitting}>
						{submitting ? 'Recommending…' : 'Recommend to practice'}
					</Button>
				</Dialog.Footer>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>
