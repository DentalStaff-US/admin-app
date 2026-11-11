<script lang="ts">
	import { LifeBuoy } from 'lucide-svelte';
	import DataTable from '$dtss/DataTable.svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import StatusBadge from '$dtss/StatusBadge.svelte';
	import type { DataColumn } from '$dtss/tableState';

	type Ticket = { id: string; title: string; status: string | null; createdAt: string | Date };

	let { tickets }: { tickets: Ticket[] } = $props();

	const columns: DataColumn<Ticket>[] = [
		{ id: 'title', header: 'Ticket', value: (t) => t.title },
		{ id: 'status', header: 'Status', cell: statusCell },
		{ id: 'created', header: 'Opened', value: (t) => new Date(t.createdAt).toLocaleDateString(), class: 'whitespace-nowrap tabular-nums' }
	];
</script>

{#snippet statusCell(t: Ticket)}<StatusBadge status={t.status} />{/snippet}

{#snippet empty()}
	<EmptyState icon={LifeBuoy} title="No support tickets" description="Tickets this practice opens show up here." />
{/snippet}

<DataTable rows={tickets} {columns} key={(t) => t.id} rowHref={(t) => `/support/ticket/${t.id}`} caption="Support tickets" {empty} />
