<script lang="ts">
	/**
	 * Timesheets list (06 › Timesheets): DataTable with tabs (To review,
	 * Discrepancies, Approved, Paid, plus All and Voided so nothing goes
	 * missing), a URL-backed FilterBar with debounced search, and phone cards.
	 */
	import { FileClock, PartyPopper, SearchX } from 'lucide-svelte';
	import DataTable from '$dtss/DataTable.svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import Page from '$dtss/Page.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';
	import StatusBadge from '$dtss/StatusBadge.svelte';
	import TabsWithCounts from '$dtss/TabsWithCounts.svelte';
	import { pageHrefFor, sortHrefFor, withParam, type DataColumn } from '$dtss/tableState';
	import type { FilterDimension } from '$lib/components/filters/types';
	import { Button } from '$lib/components/ui/button';
	import ListToolbar from './ListToolbar.svelte';
	import { TIMESHEET_TABS, type TimesheetList, type TimesheetListQuery, type TimesheetListRow } from '../timesheetList';
	import { hoursText } from '../timesheets';

	let {
		list,
		query,
		search = '',
		isAdmin,
		url
	}: {
		list: TimesheetList;
		query: TimesheetListQuery;
		search?: string;
		isAdmin: boolean;
		url: URL;
	} = $props();

	const tabs = $derived(
		TIMESHEET_TABS.map((t) => ({
			value: t.value,
			label: t.label,
			href: withParam(url, 'tab', t.value),
			count: list.counts[t.value],
			tone: t.value === 'discrepancies' ? ('warning' as const) : t.value === 'review' ? ('pending' as const) : undefined
		}))
	);

	const dimensions = $derived<FilterDimension[]>([
		...(isAdmin ? [{ key: 'practice', label: 'Practice', options: list.facets.practice, selected: query.practice }] : []),
		{ key: 'discipline', label: 'Role', options: list.facets.discipline, selected: query.discipline },
		...(isAdmin ? [{ key: 'wages', label: 'Wages', options: list.facets.wages, selected: query.wages }] : [])
	]);

	const columns = $derived<DataColumn<TimesheetListRow>[]>([
		{ id: 'professional', header: 'Professional', value: (r) => r.professional, sortable: true },
		...(isAdmin ? [{ id: 'practice', header: 'Practice', value: (r: TimesheetListRow) => r.practice ?? '—', sortable: true }] : []),
		{ id: 'request', header: 'Request', cell: requestCell },
		{ id: 'week', header: 'Week', value: (r) => r.weekLabel, sortable: true, class: 'whitespace-nowrap' },
		{ id: 'hours', header: 'Hours', value: (r) => hoursText(r.hours), numeric: true, sortable: true },
		{ id: 'status', header: 'Status', cell: statusCell, sortable: true }
	]);

	const filtered = $derived(!!search || query.practice.length + query.discipline.length + query.wages.length > 0);
	const clearHref = $derived(`${url.pathname}?tab=${query.tab}`);
</script>

{#snippet requestCell(r: TimesheetListRow)}
	<span class="block">{r.discipline ?? '—'}</span>
	{#if r.requisitionId}<span class="block text-xs text-muted-foreground">Req #{r.requisitionId}</span>{/if}
{/snippet}

{#snippet statusCell(r: TimesheetListRow)}
	<div class="flex flex-wrap gap-1.5">
		<StatusBadge status={r.status} />
		{#if isAdmin && r.wagesStatus}<StatusBadge status={r.wagesStatus} />{/if}
	</div>
{/snippet}

{#snippet mobile(r: TimesheetListRow)}
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<p class="truncate font-semibold">{r.professional}</p>
			<p class="truncate text-sm text-muted-foreground">
				{[isAdmin ? r.practice : null, r.discipline].filter(Boolean).join(' · ')}
			</p>
			<p class="text-sm text-muted-foreground">{r.weekLabel} · <span class="tabular-nums">{hoursText(r.hours)} h</span></p>
		</div>
		<StatusBadge status={r.status} />
	</div>
{/snippet}

{#snippet tabsSnippet()}
	<TabsWithCounts label="Timesheet status" active={query.tab} {tabs} />
{/snippet}

{#snippet toolbar()}
	<ListToolbar {url} {search} placeholder="Search professional, practice or request" {dimensions} />
{/snippet}

{#snippet empty()}
	{#if filtered}
		<EmptyState icon={SearchX} title="No matching timesheets" description={search ? `Nothing matches “${search}” in this tab.` : 'Nothing matches these filters in this tab.'}>
			<Button variant="outline" href={clearHref}>Clear filters</Button>
		</EmptyState>
	{:else if query.tab === 'review' || query.tab === 'discrepancies'}
		<EmptyState icon={PartyPopper} title="You're all caught up" description={query.tab === 'review' ? 'No timesheets are waiting for review.' : 'No timesheets have open discrepancies.'} />
	{:else}
		<EmptyState icon={FileClock} title="No timesheets here yet" description="Timesheets appear once professionals log hours against a request's shifts." />
	{/if}
{/snippet}

<Page>
	<PageHeader title="Timesheets" description={isAdmin ? 'Review hours, approve on a practice’s behalf and track wages.' : 'Review and approve the hours professionals worked for you.'} />
	<DataTable
		rows={list.rows}
		{columns}
		key={(r) => r.id}
		rowHref={(r) => `/timesheets/${r.id}`}
		rowLabel={(r) => `${r.professional}, ${r.weekLabel}`}
		caption="Timesheets"
		sort={query.sort}
		sortHref={(c) => sortHrefFor(url, query.sort, c)}
		pagination={{ page: list.page, pageSize: list.pageSize, total: list.total, href: (p) => pageHrefFor(url, p) }}
		tabs={tabsSnippet}
		{toolbar}
		{empty}
		{mobile}
	/>
</Page>
