<script lang="ts">
	import { UserPlus } from 'lucide-svelte';
	import DataTable from '$dtss/DataTable.svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import StatusBadge from '$dtss/StatusBadge.svelte';
	import type { DataColumn } from '$dtss/tableState';
	import { referredTypeLabel, shortDate } from './people';

	export type ReferralRow = {
		id: string;
		referredName?: string | null;
		referredEmail: string | null;
		referredRole: string | null;
		attributionSource?: string | null;
		status: string;
		rejectedReason?: string | null;
		signedUpAt?: Date | string | null;
	};

	let { referrals }: { referrals: ReferralRow[] } = $props();

	const columns: DataColumn<ReferralRow>[] = [
		{ id: 'referred', header: 'Referred', cell: referredCell },
		{ id: 'type', header: 'Type', value: (r) => referredTypeLabel(r.referredRole) },
		{ id: 'source', header: 'Source', cell: sourceCell },
		{ id: 'status', header: 'Status', cell: statusCell },
		{ id: 'joined', header: 'Joined', value: (r) => shortDate(r.signedUpAt), class: 'tabular-nums' }
	];
</script>

{#snippet referredCell(r: ReferralRow)}
	<span class="block font-semibold">{r.referredName ?? '—'}</span>
	<span class="block text-xs text-muted-foreground">{r.referredEmail}</span>
{/snippet}
{#snippet sourceCell(r: ReferralRow)}<code class="text-xs">{r.attributionSource ?? '—'}</code>{/snippet}
{#snippet statusCell(r: ReferralRow)}
	<StatusBadge status={r.status} />
	{#if r.rejectedReason}<span class="mt-1 block text-xs text-muted-foreground">{r.rejectedReason}</span>{/if}
{/snippet}

{#snippet mobile(r: ReferralRow)}
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<p class="font-semibold">{r.referredName ?? r.referredEmail ?? '—'}</p>
			<p class="truncate text-sm text-muted-foreground">{referredTypeLabel(r.referredRole)} · joined {shortDate(r.signedUpAt)}</p>
			{#if r.rejectedReason}<p class="text-xs text-muted-foreground">{r.rejectedReason}</p>{/if}
		</div>
		<div class="shrink-0 whitespace-nowrap"><StatusBadge status={r.status} /></div>
	</div>
{/snippet}

{#snippet empty()}
	<EmptyState icon={UserPlus} title="No referrals yet" description="People this affiliate refers show up here when they sign up." />
{/snippet}

<DataTable rows={referrals} {columns} key={(r) => r.id} caption="Referrals" {empty} {mobile} />
