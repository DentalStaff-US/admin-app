<script lang="ts">
	import { Loader2 } from 'lucide-svelte';
	import { superForm } from 'sveltekit-superforms/client';
	import { enhance } from '$app/forms';
	import { InviteesEditor } from '$features/settings';
	import { Button } from '$lib/components/ui/button';
	import StepCard from './StepCard.svelte';

	let { form: initial }: { form: any } = $props();

	let submitting = $state(false);
	let skipForm = $state<HTMLFormElement>();

	// Same submission as before: the invitees go as JSON (the action parses
	// `invitees`) and as indexed hidden fields.
	// svelte-ignore state_referenced_locally
	const { form, enhance: inviteEnhance } = superForm(initial, {
		resetForm: false,
		onSubmit: ({ formData }) => {
			formData.set('invitees', JSON.stringify($form.invitees));
			submitting = true;
			return true;
		},
		onResult: () => {
			submitting = false;
		}
	});

	$effect.pre(() => {
		if (!$form.invitees) $form.invitees = [];
	});
</script>

<form method="POST" action="?/sendInvites" use:inviteEnhance>
	<StepCard>
		<InviteesEditor bind:invitees={$form.invitees} />
		{#snippet footer()}
			<Button type="button" variant="ghost" class="text-muted-foreground" on:click={() => skipForm?.requestSubmit()}>
				Skip for now
			</Button>
			<Button type="submit" class="w-full sm:w-auto" disabled={submitting || !$form.invitees?.length}>
				{#if submitting}
					<Loader2 class="mr-2 size-4 animate-spin" aria-hidden="true" /> Sending…
				{:else}
					Send {$form.invitees?.length > 1 ? `${$form.invitees.length} invites` : 'invite'} and continue
				{/if}
			</Button>
		{/snippet}
	</StepCard>
</form>
<form bind:this={skipForm} method="POST" action="?/skipInviting" use:enhance class="hidden"></form>
