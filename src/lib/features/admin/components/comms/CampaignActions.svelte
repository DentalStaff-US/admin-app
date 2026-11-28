<script lang="ts">
	import { enhance } from '$app/forms';
	import { RotateCcw, XCircle } from 'lucide-svelte';
	import ConfirmDialog from '$dtss/ConfirmDialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import { audienceLabel, canCancelCampaign, canRetryCampaign, campaignPending, plural, type CampaignRow } from './comms';

	let { campaign }: { campaign: CampaignRow } = $props();

	let cancelOpen = $state(false);
	let retryOpen = $state(false);
	let busy = $state(false);

	const canCancel = $derived(canCancelCampaign(campaign.status));
	const canRetry = $derived(canRetryCampaign(campaign));
	const pending = $derived(campaignPending(campaign));

	const submit = (close: () => void) => () => {
		busy = true;
		return async ({ update }: { update: () => Promise<void> }) => {
			busy = false;
			close();
			await update();
		};
	};
</script>

{#if canCancel}
	<Button variant="destructiveOutline" on:click={() => (cancelOpen = true)}>
		<XCircle class="mr-2 size-4" aria-hidden="true" /> Cancel remaining sends
	</Button>
{/if}
{#if canRetry}
	<Button variant="outline" on:click={() => (retryOpen = true)}>
		<RotateCcw class="mr-2 size-4" aria-hidden="true" /> Retry {plural(campaign.failedCount, 'failed send')}
	</Button>
{/if}

<ConfirmDialog
	bind:open={cancelOpen}
	title={`Cancel “${campaign.name}”?`}
	description={`The ${plural(pending, 'recipient')} not reached yet won't get this ${(campaign.channel === 'SMS' ? 'SMS' : 'email')}. Messages already sent can't be recalled.`}
	cancelLabel="Keep sending"
>
	{#snippet confirm()}
		<form method="POST" action="?/cancel" use:enhance={submit(() => (cancelOpen = false))}>
			<Button type="submit" variant="destructive" class="w-full" disabled={busy}>
				{busy ? 'Cancelling…' : 'Cancel remaining sends'}
			</Button>
		</form>
	{/snippet}
</ConfirmDialog>

<ConfirmDialog
	bind:open={retryOpen}
	title={`Retry ${plural(campaign.failedCount, 'failed send')}?`}
	description={`${audienceLabel(campaign.audience)} whose ${(campaign.channel === 'SMS' ? 'SMS' : 'email')} failed are queued again and sent shortly.`}
>
	{#snippet confirm()}
		<form method="POST" action="?/retry" use:enhance={submit(() => (retryOpen = false))}>
			<Button type="submit" class="w-full" disabled={busy}>{busy ? 'Queueing…' : 'Retry sends'}</Button>
		</form>
	{/snippet}
</ConfirmDialog>
