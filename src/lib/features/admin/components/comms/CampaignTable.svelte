<script lang="ts">
	import { Megaphone } from 'lucide-svelte';
	import DataTable from '$dtss/DataTable.svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import StatusBadge from '$dtss/StatusBadge.svelte';
	import type { DataColumn } from '$dtss/tableState';
	import { Button } from '$lib/components/ui/button';
	import { audienceLabel, channelLabel, formatDateTime, type CampaignRow } from './comms';

	let { campaigns }: { campaigns: CampaignRow[] } = $props();

	const columns: DataColumn<CampaignRow>[] = [
		{ id: 'name', header: 'Name', value: (c) => c.name },
		{ id: 'audience', header: 'Audience', value: (c) => audienceLabel(c.audience) },
		{ id: 'channel', header: 'Channel', value: (c) => channelLabel(c.channel) },
		{ id: 'status', header: 'Status', cell: status },
		{ id: 'sent', header: 'Sent', value: (c) => c.sentCount, numeric: true },
		{ id: 'failed', header: 'Failed', value: (c) => c.failedCount, numeric: true },
		{ id: 'total', header: 'Total', value: (c) => c.recipientCount, numeric: true },
		{ id: 'created', header: 'Created', value: (c) => formatDateTime(c.createdAt), class: 'whitespace-nowrap text-muted-foreground' }
	];
</script>

{#snippet status(c: CampaignRow)}<StatusBadge status={c.status} />{/snippet}

{#snippet mobile(c: CampaignRow)}
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<p class="truncate font-semibold">{c.name}</p>
			<p class="text-sm text-muted-foreground">{audienceLabel(c.audience)} · {channelLabel(c.channel)}</p>
			<p class="mt-1 text-sm tabular-nums">
				{c.sentCount} sent · {c.failedCount} failed · {c.recipientCount} total
			</p>
			<p class="text-caption text-muted-foreground">{formatDateTime(c.createdAt)}</p>
		</div>
		<StatusBadge status={c.status} />
	</div>
{/snippet}

{#snippet empty()}
	<EmptyState
		icon={Megaphone}
		title="No mass notifications yet"
		description="Send a targeted SMS or email to professionals or practices. You preview who it reaches before anything goes out."
	>
		<Button href="/admin/menu/mass-notifications/create">New mass notification</Button>
	</EmptyState>
{/snippet}

<DataTable
	rows={campaigns}
	{columns}
	key={(c) => c.id}
	rowHref={(c) => `/admin/menu/mass-notifications/${c.id}`}
	rowLabel={(c) => `Open ${c.name}`}
	caption="Mass notifications"
	{mobile}
	{empty}
/>
