<script lang="ts">
	import { Briefcase, CalendarClock, FileText, Receipt } from 'lucide-svelte';
	import AdminShell from '$shell/AdminShell.svelte';
	import ConfirmDialog from '$dtss/ConfirmDialog.svelte';
	import DataTable from '$dtss/DataTable.svelte';
	import FactGrid from '$dtss/FactGrid.svelte';
	import FormSheet from '$dtss/FormSheet.svelte';
	import Page from '$dtss/Page.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';
	import Section from '$dtss/Section.svelte';
	import StatTile from '$dtss/StatTile.svelte';
	import StatusBadge from '$dtss/StatusBadge.svelte';
	import TabsWithCounts from '$dtss/TabsWithCounts.svelte';
	import Timeline from '$dtss/Timeline.svelte';
	import type { DataColumn } from '$dtss/tableState';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';

	type Req = { id: number; role: string; practice: string; dates: string; rate: number; status: string; filled: string };
	const rows: Req[] = [
		{ id: 1042, role: 'Dental Hygienist', practice: 'Bright Smiles Tampa', dates: 'Nov 12 – Nov 14', rate: 48, status: 'OPEN', filled: '1/3' },
		{ id: 1041, role: 'Dental Assistant', practice: 'Oak Street Family Dentistry', dates: 'Nov 11', rate: 30, status: 'PENDING', filled: '0/1' },
		{ id: 1038, role: 'Front Office', practice: 'Harbor Dental Group', dates: 'Nov 9 – Nov 20', rate: 24, status: 'CLOSED', filled: '8/8' }
	];
	const columns: DataColumn<Req>[] = [
		{ id: 'role', header: 'Requisition', value: (r) => `#${r.id} · ${r.role}`, sortable: true },
		{ id: 'practice', header: 'Practice', value: (r) => r.practice },
		{ id: 'dates', header: 'Dates', value: (r) => r.dates },
		{ id: 'rate', header: 'Rate', value: (r) => `$${r.rate}/hr`, numeric: true, sortable: true },
		{ id: 'filled', header: 'Filled', value: (r) => r.filled, numeric: true },
		{ id: 'status', header: 'Status', cell: status }
	];
	let sheetOpen = $state(false);
	let dirty = $state(false);
	let confirmOpen = $state(false);
	let sidebar = $state<'expanded' | 'rail'>('expanded');
</script>

{#snippet status(r: Req)}<StatusBadge status={r.status} />{/snippet}
{#snippet mobile(r: Req)}
	<div class="flex items-start justify-between gap-3">
		<div><p class="font-semibold">#{r.id} · {r.role}</p><p class="text-sm text-muted-foreground">{r.practice} · {r.dates}</p></div>
		<StatusBadge status={r.status} />
	</div>
{/snippet}
{#snippet tabs()}
	<TabsWithCounts
		label="Requisition status"
		active="open"
		tabs={[
			{ value: 'open', label: 'Open', href: '?tab=open', count: 12 },
			{ value: 'pending', label: 'Pending', href: '?tab=pending', count: 3, tone: 'pending' },
			{ value: 'past', label: 'Past', href: '?tab=past', count: 140 },
			{ value: 'all', label: 'All', href: '?tab=all' }
		]}
	/>
{/snippet}
{#snippet toolbar()}<Input placeholder="Search requisitions" class="max-w-xs" />{/snippet}

<AdminShell pathname="/requisitions" nav={{ role: 'SUPERADMIN' }} bind:sidebar name="Shannon Carter" initials="SC">
	<Page>
		<PageHeader title="Requisitions" description="Every temp and permanent requisition.">
			{#snippet actions()}
				<Button variant="outline" on:click={() => (confirmOpen = true)}>Delete draft</Button>
				<Button on:click={() => (sheetOpen = true)}>New requisition</Button>
			{/snippet}
		</PageHeader>
		<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
			<StatTile label="Unfilled soon" value={4} icon={CalendarClock} tone="warning" href="#" hint="Open shifts starting in the next 48 hours.">
				{#snippet detail()}<span>2 start tomorrow</span>{/snippet}
			</StatTile>
			<StatTile label="Fill rate" value="92%" icon={Briefcase} trend={{ percent: 3 }} />
			<StatTile label="Timesheets to review" value={7} icon={FileText} tone="pending" href="#" />
			<StatTile label="Billed this month" value="$48,210" icon={Receipt} trend={{ percent: -4 }} />
		</div>
		<DataTable {rows} {columns} key={(r) => r.id} rowHref={(r) => `/requisitions/${r.id}`} caption="Requisitions"
			sort={{ column: 'rate', direction: 'desc' }} sortHref={(c) => `?sort=${c}`}
			pagination={{ page: 1, pageSize: 3, total: 134, href: (p) => `?page=${p}` }} {mobile} {tabs} {toolbar} />
		<div class="grid gap-6 lg:grid-cols-3">
			<Section title="Details" class="lg:col-span-2">
				<FactGrid facts={[{ label: 'Rate', value: '$48/hr' }, { label: 'Dates', value: 'Nov 12–14' }, { label: 'Location', value: 'Tampa' }, { label: 'Experience', value: '3+ years' }]} />
			</Section>
			<Section title="History">
				<Timeline entries={[
					{ id: 1, at: new Date(), actor: 'Shannon C.', text: 'approved the timesheet', tone: 'positive' },
					{ id: 2, at: new Date(Date.now() - 864e5), actor: 'Maria L.', text: 'claimed Tuesday', tone: 'info' },
					{ id: 3, at: new Date(Date.now() - 2 * 864e5), text: 'Requisition posted', tone: 'neutral' }
				]} />
			</Section>
		</div>
	</Page>
</AdminShell>

<FormSheet bind:open={sheetOpen} title="New requisition" description="Post a temp or permanent requisition." {dirty}>
	<label class="block text-sm font-semibold">Notes <Input oninput={() => (dirty = true)} /></label>
	{#snippet footer()}
		<Button variant="outline" on:click={() => (sheetOpen = false)}>Cancel</Button>
		<Button>Save</Button>
	{/snippet}
</FormSheet>

<ConfirmDialog bind:open={confirmOpen} title="Delete this draft?" description="The draft and its dates are removed. This can't be undone." confirmText="DELETE">
	{#snippet confirm({ ready })}<Button variant="destructive" disabled={!ready}>Delete draft</Button>{/snippet}
</ConfirmDialog>
