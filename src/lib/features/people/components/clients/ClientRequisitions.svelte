<script lang="ts">
	import { formatInTimeZone } from 'date-fns-tz';
	import { Briefcase, CalendarDays, ClipboardList, Clock, LayoutList, Plus } from 'lucide-svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import DataTable from '$dtss/DataTable.svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import Section from '$dtss/Section.svelte';
	import StatusBadge from '$dtss/StatusBadge.svelte';
	import type { DataColumn } from '$dtss/tableState';
	import Calendar from '$lib/components/calendar/calendar.svelte';
	import { formatTimezoneName } from '$lib/_helpers/UTCTimezoneUtils';
	import type { CalendarEvent } from '$lib/types';
	import { cn } from '$lib/utils';

	type Req = {
		id: number;
		disciplineName: string | null;
		locationName: string | null;
		status: string;
		permanentPosition: boolean | null;
		hourlyRate: number | null;
	};

	/** The practice's requisitions as a table or a calendar of days. */
	let {
		requisitions,
		recurrenceDays,
		isAdmin,
		onNew
	}: { requisitions: Req[]; recurrenceDays: any[]; isAdmin: boolean; onNew?: () => void } = $props();

	let view = $state<'table' | 'calendar'>('table');
	let selected = $state<CalendarEvent | null>(null);
	let eventOpen = $state(false);

	const columns: DataColumn<Req>[] = [
		{ id: 'position', header: 'Position', cell: positionCell },
		{ id: 'type', header: 'Type', cell: typeCell },
		{ id: 'status', header: 'Status', cell: statusCell },
		{ id: 'rate', header: 'Rate', value: (r) => `$${(r.hourlyRate ?? 0).toFixed(2)}`, numeric: true }
	];
</script>

{#snippet positionCell(r: Req)}
	<span class="block">{r.disciplineName ?? 'Position'} <span class="font-normal text-muted-foreground">· Req #{r.id}</span></span>
	<span class="block text-caption font-normal text-muted-foreground">{r.locationName || 'No location'}</span>
{/snippet}

{#snippet typeCell(r: Req)}
	<!-- 03 › Type pill: Temp is always teal, Permanent always brand blue. -->
	{#if r.permanentPosition}
		<span class="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-brand-dark"><Briefcase class="size-3.5" aria-hidden="true" />Permanent</span>
	{:else}
		<span class="inline-flex items-center gap-1 rounded-full bg-pro/10 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-pro-dark"><CalendarDays class="size-3.5" aria-hidden="true" />Temp</span>
	{/if}
{/snippet}

{#snippet statusCell(r: Req)}<StatusBadge status={r.status} />{/snippet}

{#snippet empty()}
	<EmptyState icon={ClipboardList} title="No requisitions yet" description="Requisitions this practice posts, or you post for them, show up here.">
		{#if isAdmin && onNew}<Button on:click={onNew}>Post the first requisition</Button>{/if}
	</EmptyState>
{/snippet}

<Section title="Requisitions" flush>
	{#snippet actions()}
		<div class="inline-flex h-9 items-center rounded-md bg-muted p-1" role="group" aria-label="View">
			{#each [{ v: 'table', icon: LayoutList, label: 'Table view' }, { v: 'calendar', icon: CalendarDays, label: 'Calendar view' }] as opt (opt.v)}
				{@const Icon = opt.icon}
				<button
					type="button"
					aria-pressed={view === opt.v}
					aria-label={opt.label}
					class={cn(
						'inline-flex h-7 items-center rounded-sm px-2.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
						view === opt.v && 'bg-background text-foreground shadow-card'
					)}
					onclick={() => (view = opt.v as 'table' | 'calendar')}
				>
					<Icon class="size-4" aria-hidden="true" />
				</button>
			{/each}
		</div>
		{#if isAdmin && onNew}
			<Button size="sm" class="gap-2" on:click={onNew}><Plus class="size-4" aria-hidden="true" />New requisition</Button>
		{/if}
	{/snippet}
	{#if view === 'table'}
		<DataTable
			rows={requisitions}
			{columns}
			key={(r) => r.id}
			rowHref={(r) => `/requisitions/${r.id}`}
			rowLabel={(r) => `Open requisition ${r.id}`}
			caption="Requisitions"
			{empty}
			class="rounded-none border-0 shadow-none"
		/>
	{:else}
		<div class="p-4 sm:p-6">
			<Calendar events={recurrenceDays} selectEvent={(e: CalendarEvent) => { selected = e; eventOpen = true; }} />
		</div>
	{/if}
</Section>

<Dialog.Root bind:open={eventOpen}>
	<Dialog.Content class="sm:max-w-lg">
		{#if selected}
			{@const ext = (selected as any).extendedProps}
			<Dialog.Header>
				<Dialog.Title class="text-h2">{selected.title}</Dialog.Title>
				<Dialog.Description>{ext?.requisition?.client?.companyName ?? ''}</Dialog.Description>
			</Dialog.Header>
			{#if ext?.type === 'RECURRENCE_DAY'}
				{@const tz = ext.requisition?.referenceTimezone || 'America/New_York'}
				{@const start = ext.recurrenceDay?.dayStart}
				{@const end = ext.recurrenceDay?.dayEnd}
				<div class="space-y-2 text-sm">
					<p class="flex items-center gap-2"><CalendarDays class="size-4 text-muted-foreground" aria-hidden="true" />{start ? formatInTimeZone(new Date(start), tz, 'EEEE, MMM d, yyyy') : ''}</p>
					<p class="flex items-center gap-2">
						<Clock class="size-4 text-muted-foreground" aria-hidden="true" />
						{start ? formatInTimeZone(new Date(start), tz, 'p') : ''}–{end ? formatInTimeZone(new Date(end), tz, 'p') : ''}
						<span class="text-muted-foreground">({formatTimezoneName(tz)})</span>
					</p>
				</div>
				<Dialog.Footer>
					<Button href="/requisitions/{(selected as any).resourceIds?.[0]}">View requisition</Button>
				</Dialog.Footer>
			{/if}
		{/if}
	</Dialog.Content>
</Dialog.Root>
