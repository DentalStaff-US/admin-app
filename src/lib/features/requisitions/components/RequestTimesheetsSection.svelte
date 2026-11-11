<script lang="ts">
	import { ClipboardList } from 'lucide-svelte';
	import { format, parse } from 'date-fns';
	import DataTable from '$dtss/DataTable.svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import StatusBadge from '$dtss/StatusBadge.svelte';
	import type { DataColumn } from '$dtss/tableState';

	type Row = {
		timeSheet: {
			id: string;
			weekBeginDate: string;
			totalHoursWorked: string | null;
			totalHoursBilled: string | null;
			status: string;
		};
		user: { firstName?: string | null; lastName?: string | null };
	};

	let { timesheets }: { timesheets: Row[] } = $props();

	const name = (r: Row) => `${r.user.firstName ?? ''} ${r.user.lastName ?? ''}`.trim() || 'Professional';
	const week = (r: Row) => format(parse(r.timeSheet.weekBeginDate, 'yyyy-MM-dd', new Date()), 'MMM d, yyyy');

	const columns: DataColumn<Row>[] = [
		{ id: 'week', header: 'Week of', value: week },
		{ id: 'professional', header: 'Professional', value: name },
		{ id: 'worked', header: 'Hours worked', value: (r) => r.timeSheet.totalHoursWorked ?? '—', numeric: true },
		{ id: 'billed', header: 'Hours billed', value: (r) => r.timeSheet.totalHoursBilled ?? '—', numeric: true },
		{ id: 'status', header: 'Status', cell: status }
	];
</script>

{#snippet status(r: Row)}<StatusBadge status={r.timeSheet.status} />{/snippet}
{#snippet mobile(r: Row)}
	<div class="flex items-start justify-between gap-3">
		<div>
			<p class="font-semibold">Week of {week(r)}</p>
			<p class="text-sm text-muted-foreground">{name(r)} · <span class="tabular-nums">{r.timeSheet.totalHoursWorked ?? '—'} h</span></p>
		</div>
		<StatusBadge status={r.timeSheet.status} />
	</div>
{/snippet}
{#snippet empty()}
	<EmptyState icon={ClipboardList} title="No timesheets yet" description="Timesheets appear here once the first day has been worked." />
{/snippet}

<DataTable
	rows={timesheets}
	{columns}
	key={(r) => r.timeSheet.id}
	rowHref={(r) => `/timesheets/${r.timeSheet.id}`}
	rowLabel={(r) => `Open timesheet for ${name(r)}, week of ${week(r)}`}
	caption="Timesheets on this request"
	{mobile}
	{empty}
/>
