<script lang="ts">
	import { CheckCircle2, Clock, Users, XCircle } from 'lucide-svelte';
	import DataTable from '$dtss/DataTable.svelte';
	import FactGrid from '$dtss/FactGrid.svelte';
	import Section from '$dtss/Section.svelte';
	import StatTile from '$dtss/StatTile.svelte';
	import StatusBadge from '$dtss/StatusBadge.svelte';
	import type { DataColumn } from '$dtss/tableState';
	import {
		audienceLabel,
		campaignPending,
		channelLabel,
		formatDateTime,
		recipientName,
		type CampaignRecipientRow,
		type CampaignRow
	} from './comms';

	let { campaign, recipients }: { campaign: CampaignRow; recipients: CampaignRecipientRow[] } = $props();

	const columns: DataColumn<CampaignRecipientRow>[] = [
		{ id: 'name', header: 'Name', value: (r) => recipientName(r) },
		{ id: 'to', header: 'To', value: (r) => r.toAddress, class: 'break-all' },
		{ id: 'status', header: 'Status', cell: recipientStatus },
		{ id: 'sentAt', header: 'Sent at', value: (r) => formatDateTime(r.sentAt), class: 'whitespace-nowrap text-muted-foreground' },
		{ id: 'error', header: 'Error', value: (r) => r.error ?? '', class: 'text-xs text-status-negative-fg' }
	];
</script>

{#snippet campaignStatus()}<StatusBadge status={campaign.status} />{/snippet}
{#snippet recipientStatus(r: CampaignRecipientRow)}<StatusBadge status={r.status} />{/snippet}
{#snippet mobile(r: CampaignRecipientRow)}
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<p class="font-semibold">{recipientName(r)}</p>
			<p class="break-all text-sm text-muted-foreground">{r.toAddress}</p>
			<p class="text-caption text-muted-foreground">{formatDateTime(r.sentAt)}</p>
			{#if r.error}<p class="mt-1 text-xs text-status-negative-fg">{r.error}</p>{/if}
		</div>
		<StatusBadge status={r.status} />
	</div>
{/snippet}

<FactGrid
	facts={[
		{ label: 'Status', cell: campaignStatus },
		{ label: 'Audience', value: audienceLabel(campaign.audience) },
		{ label: 'Channel', value: channelLabel(campaign.channel) },
		{ label: 'Created', value: formatDateTime(campaign.createdAt) }
	]}
/>

<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
	<StatTile label="Recipients" value={campaign.recipientCount} icon={Users} />
	<StatTile label="Sent" value={campaign.sentCount} icon={CheckCircle2} tone="positive" />
	<StatTile label="Failed" value={campaign.failedCount} icon={XCircle} tone="negative" />
	<StatTile label="Pending" value={campaignPending(campaign)} icon={Clock} tone="pending" hint="Queued recipients not sent to yet." />
</div>

<Section title="Message">
	{#if campaign.subject}
		<p class="text-sm"><span class="font-semibold">Subject:</span> {campaign.subject}</p>
	{/if}
	<p class="mt-2 whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-sm">{campaign.body}</p>
</Section>

<section class="space-y-3">
	<h2 class="text-h3">Recipients</h2>
	<DataTable rows={recipients} {columns} key={(r) => r.id} caption="Recipients of this mass notification" {mobile} />
</section>
