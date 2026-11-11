<script lang="ts">
	import { format } from 'date-fns';
	import { FileText } from 'lucide-svelte';
	import DataTable from '$dtss/DataTable.svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import StatusBadge from '$dtss/StatusBadge.svelte';
	import type { DataColumn } from '$dtss/tableState';
	import type { TimesheetSummary } from '../../people';

	/** One row per timesheet (a week of worked shifts), newest first. */
	let { timesheets }: { timesheets: TimesheetSummary[] } = $props();

	const week = (t: TimesheetSummary) =>
		t.weekBeginDate ? `Week of ${format(new Date(`${t.weekBeginDate}T12:00:00`), 'PP')}` : 'Undated';

	const columns: DataColumn<TimesheetSummary>[] = [
		{ id: 'week', header: 'Week', value: week, class: 'whitespace-nowrap' },
		{ id: 'practice', header: 'Practice', value: (t) => t.practice ?? '—' },
		{ id: 'shifts', header: 'Shifts', value: (t) => t.shifts, numeric: true },
		{ id: 'hours', header: 'Hours', value: (t) => (t.totalHoursWorked ?? '—'), numeric: true },
		{ id: 'status', header: 'Status', cell: statusCell }
	];
</script>

{#snippet statusCell(t: TimesheetSummary)}<StatusBadge status={t.status} />{/snippet}

{#snippet mobile(t: TimesheetSummary)}
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<p class="font-semibold">{week(t)}</p>
			<p class="truncate text-sm text-muted-foreground">{t.practice ?? '—'} · {t.shifts} {t.shifts === 1 ? 'shift' : 'shifts'} · {t.totalHoursWorked ?? '—'} h</p>
		</div>
		<StatusBadge status={t.status} />
	</div>
{/snippet}

{#snippet empty()}
	<EmptyState icon={FileText} title="No timesheets yet" description="Timesheets appear once this professional works a shift." />
{/snippet}

<DataTable rows={timesheets} {columns} key={(t) => t.id} rowHref={(t) => `/timesheets/${t.id}`} rowLabel={(t) => `Open timesheet, ${week(t)}`} caption="Timesheets" {mobile} {empty} />
