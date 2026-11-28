<script lang="ts">
	import { format } from 'date-fns';
	import { CalendarClock } from 'lucide-svelte';
	import DataTable from '$dtss/DataTable.svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import type { DataColumn } from '$dtss/tableState';
	import { joinAddress } from '../../people';

	type Shift = {
		workday: { id: string };
		recurrenceDay: { dayStart: Date | string };
		requisition: { id: number; title: string | null; companyName: string | null };
		location: { address1: string | null; address2: string | null; city: string | null; state: string | null; zip: string | null };
		timesheet: { id: string; totalHoursWorked: string | number | null } | null;
	};

	/** Worked shifts (the work-history query: workdays that have a timesheet). */
	let { shifts }: { shifts: Shift[] } = $props();

	const address = (s: Shift) =>
		joinAddress({ street: s.location.address1, street2: s.location.address2, city: s.location.city, state: s.location.state, zip: s.location.zip });

	const columns: DataColumn<Shift>[] = [
		{ id: 'date', header: 'Date', value: (s) => format(new Date(s.recurrenceDay.dayStart), 'EEE, PP'), class: 'whitespace-nowrap tabular-nums' },
		{ id: 'position', header: 'Position', value: (s) => s.requisition.title || `Req #${s.requisition.id}` },
		{ id: 'practice', header: 'Practice', cell: practiceCell },
		{ id: 'hours', header: 'Timesheet hours', value: (s) => s.timesheet?.totalHoursWorked ?? '—', numeric: true }
	];
</script>

{#snippet practiceCell(s: Shift)}
	<p>{s.requisition.companyName ?? '—'}</p>
	<p class="max-w-64 truncate text-caption text-muted-foreground">{address(s)}</p>
{/snippet}

{#snippet empty()}
	<EmptyState icon={CalendarClock} title="No worked shifts yet" description="Shifts appear here once they have a timesheet." />
{/snippet}

<DataTable
	rows={shifts}
	{columns}
	key={(s) => s.workday.id}
	rowHref={(s) => (s.timesheet ? `/timesheets/${s.timesheet.id}` : `/requisitions/${s.requisition.id}`)}
	rowLabel={(s) => `Open the timesheet for ${format(new Date(s.recurrenceDay.dayStart), 'PP')}`}
	caption="Worked shifts"
	{empty}
/>
