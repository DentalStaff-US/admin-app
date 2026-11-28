<script lang="ts">
	/**
	 * Invoices list: DataTable with tabs (All, Open, Overdue, Paid, Voided), a
	 * URL-backed FilterBar with debounced search, and phone cards.
	 */
	import { FileText, PartyPopper, SearchX } from 'lucide-svelte';
	import DataTable from '$dtss/DataTable.svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import Page from '$dtss/Page.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';
	import StatusBadge from '$dtss/StatusBadge.svelte';
	import TabsWithCounts from '$dtss/TabsWithCounts.svelte';
	import { pageHrefFor, sortHrefFor, withParam, type DataColumn } from '$dtss/tableState';
	import type { FilterDimension } from '$lib/components/filters/types';
	import { Button } from '$lib/components/ui/button';
	import { TONE_CLASSES } from '$tokens/status';
	import { ListToolbar, usd } from '$features/timesheets';
	import { INVOICE_TABS, type InvoiceList, type InvoiceListQuery, type InvoiceListRow } from '../invoices';

	let {
		list,
		query,
		search = '',
		isAdmin,
		url
	}: { list: InvoiceList; query: InvoiceListQuery; search?: string; isAdmin: boolean; url: URL } = $props();

	const date = (iso: string | null) =>
		iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

	const tabs = $derived(
		INVOICE_TABS.map((t) => ({
			value: t.value,
			label: t.label,
			href: withParam(url, 'tab', t.value),
			count: list.counts[t.value],
			tone: t.value === 'overdue' ? ('warning' as const) : undefined
		}))
	);

	const dimensions = $derived<FilterDimension[]>([
		...(isAdmin ? [{ key: 'practice', label: 'Practice', options: list.facets.practice, selected: query.practice }] : []),
		{ key: 'method', label: 'Method', options: list.facets.method, selected: query.method }
	]);

	const columns = $derived<DataColumn<InvoiceListRow>[]>([
		{ id: 'number', header: 'Invoice', value: (r) => r.number, sortable: true, class: 'whitespace-nowrap' },
		{ id: 'party', header: isAdmin ? 'Practice' : 'Professional', value: (r) => (isAdmin ? r.practice : r.professional) ?? '—', sortable: true },
		{ id: 'request', header: 'Requisition', value: (r) => (r.requisitionId ? `#${r.requisitionId}` : '—') },
		{ id: 'due', header: 'Due', cell: dueCell, sortable: true },
		{ id: 'amount', header: 'Amount', value: (r) => usd(r.total), numeric: true, sortable: true },
		{ id: 'status', header: 'Status', cell: statusCell, sortable: true }
	]);

	const filtered = $derived(!!search || query.practice.length + query.method.length > 0);
	const clearHref = $derived(`${url.pathname}?tab=${query.tab}`);
</script>

<!-- Overdue isn't a stored status, so it gets the warning tone directly. -->
{#snippet overdue()}
	<span class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold {TONE_CLASSES.warning}">Overdue</span>
{/snippet}

{#snippet dueCell(r: InvoiceListRow)}
	<span class={r.overdue ? 'font-semibold text-status-warning-fg' : ''}>{date(r.dueDate)}</span>
{/snippet}

{#snippet statusCell(r: InvoiceListRow)}
	<div class="flex flex-wrap gap-1.5">
		<StatusBadge status={r.status} />
		{#if r.overdue}{@render overdue()}{/if}
	</div>
{/snippet}

{#snippet mobile(r: InvoiceListRow)}
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<p class="truncate font-semibold">{r.number}</p>
			<p class="truncate text-sm text-muted-foreground">{(isAdmin ? r.practice : r.professional) ?? '—'}</p>
			<p class="text-sm text-muted-foreground">Due {date(r.dueDate)}</p>
		</div>
		<div class="flex shrink-0 flex-col items-end gap-1">
			<p class="font-semibold tabular-nums">{usd(r.total)}</p>
			{#if r.overdue}{@render overdue()}{:else}<StatusBadge status={r.status} />{/if}
		</div>
	</div>
{/snippet}

{#snippet tabsSnippet()}
	<TabsWithCounts label="Invoice status" active={query.tab} {tabs} />
{/snippet}

{#snippet toolbar()}
	<ListToolbar {url} {search} placeholder="Search invoice, practice or professional" {dimensions} />
{/snippet}

{#snippet empty()}
	{#if filtered}
		<EmptyState icon={SearchX} title="No matching invoices" description={search ? `Nothing matches “${search}” in this tab.` : 'Nothing matches these filters in this tab.'}>
			<Button variant="outline" href={clearHref}>Clear filters</Button>
		</EmptyState>
	{:else if query.tab === 'overdue'}
		<EmptyState icon={PartyPopper} title="Nothing overdue" description="Every open invoice is within its due date." />
	{:else}
		<EmptyState icon={FileText} title="No invoices here yet" description="Invoices are created when timesheets are approved and appear here." />
	{/if}
{/snippet}

<Page>
	<PageHeader title="Invoices" description={isAdmin ? 'Every invoice across practices, and its payments.' : 'Your invoices and what’s still due.'} />
	<DataTable
		rows={list.rows}
		{columns}
		key={(r) => r.id}
		rowHref={(r) => `/invoices/${r.id}`}
		rowLabel={(r) => `Invoice ${r.number}`}
		caption="Invoices"
		sort={query.sort}
		sortHref={(c) => sortHrefFor(url, query.sort, c)}
		pagination={{ page: list.page, pageSize: list.pageSize, total: list.total, href: (p) => pageHrefFor(url, p) }}
		tabs={tabsSnippet}
		{toolbar}
		{empty}
		{mobile}
	/>
</Page>
