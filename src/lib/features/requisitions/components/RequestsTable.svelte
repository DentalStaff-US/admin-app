<script lang="ts">
	import { goto } from '$app/navigation';
	import { ClipboardList, Search } from 'lucide-svelte';
	import { formatInTimeZone } from 'date-fns-tz';
	import DataTable from '$dtss/DataTable.svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import StatusBadge from '$dtss/StatusBadge.svelte';
	import TabsWithCounts from '$dtss/TabsWithCounts.svelte';
	import {
		pageHrefFor,
		sortHrefFor,
		withParam,
		type DataColumn,
		type SortState
	} from '$dtss/tableState';
	import FilterBar from '$lib/components/filters/FilterBar.svelte';
	import type { FilterDimension } from '$lib/components/filters/types';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { statusLabel } from '$tokens/status';
	import { activeDays, fillProgress, type FacetOption, type ListRow, type ListTab } from '../requestList';
	import FillProgress from './FillProgress.svelte';
	import RequisitionTypePill from './RequisitionTypePill.svelte';

	let {
		url,
		rows,
		total,
		page,
		pageSize,
		tab,
		counts,
		sort,
		facets,
		isAdmin,
		searchTerm = '',
		noun = 'request'
	}: {
		url: URL;
		rows: ListRow[];
		total: number;
		page: number;
		pageSize: number;
		tab: ListTab;
		counts: Record<ListTab, number>;
		sort: SortState;
		facets: Record<'location' | 'discipline' | 'practice' | 'status' | 'type', FacetOption[]>;
		isAdmin: boolean;
		searchTerm?: string;
		/** "request" for practices, "requisition" for admins. */
		noun?: string;
	} = $props();

	// ── URL helpers: filters live in the query string so views can be shared.
	function navigate(href: string, replaceState = false) {
		goto(href, { keepFocus: true, noScroll: true, replaceState });
	}
	function setMany(changes: Record<string, string | string[] | null>) {
		const next = new URL(url);
		for (const [name, value] of Object.entries(changes)) {
			next.searchParams.delete(name);
			const values = Array.isArray(value) ? value : value ? [value] : [];
			if (values.length) next.searchParams.set(name, values.join(','));
		}
		next.searchParams.delete('page');
		return `${next.pathname}${next.search}`;
	}
	const selected = (name: string) =>
		(url.searchParams.get(name) ?? '').split(',').map((v) => v.trim()).filter(Boolean);

	// Instant, debounced search (the separate Search button is retired, 03 › FilterBar).
	let search = $state(searchTerm);
	let timer: ReturnType<typeof setTimeout> | undefined;
	function onSearchInput() {
		clearTimeout(timer);
		timer = setTimeout(() => navigate(withParam(url, 'search', search.trim()), true), 400);
	}

	const dimensions = $derived<FilterDimension[]>([
		{ key: 'location', label: 'Location', options: facets.location, selected: selected('location') },
		{ key: 'discipline', label: 'Discipline', options: facets.discipline, selected: selected('discipline') },
		{ key: 'type', label: 'Type', options: facets.type, selected: selected('type') },
		{
			key: 'status',
			label: 'Status',
			options: facets.status.map((o) => ({ ...o, label: statusLabel(o.value) })),
			selected: selected('status')
		},
		...(isAdmin
			? [{ key: 'practice', label: 'Practice', options: facets.practice, selected: selected('practice') }]
			: [])
	]);

	let from = $state(url.searchParams.get('from') ?? '');
	let to = $state(url.searchParams.get('to') ?? '');
	const hasFilters = $derived(
		dimensions.some((d) => d.selected.length) || !!searchTerm || !!from || !!to
	);
	function clearAll() {
		search = '';
		from = '';
		to = '';
		navigate(setMany({ search: null, location: null, discipline: null, type: null, status: null, practice: null, from: null, to: null }));
	}

	const TAB_LABELS: Record<ListTab, string> = {
		open: 'Open',
		filled: 'Filled',
		past: 'Past',
		permanent: 'Permanent',
		all: 'All'
	};
	const tabs = $derived(
		(Object.keys(TAB_LABELS) as ListTab[]).map((value) => ({
			value,
			label: TAB_LABELS[value],
			count: counts[value],
			href: withParam(url, 'tab', value === 'open' ? null : value)
		}))
	);

	function dates(row: ListRow) {
		if (row.permanentPosition || activeDays(row).length === 0) {
			return `Posted ${formatInTimeZone(new Date(row.createdAt), row.referenceTimezone, 'MMM d, yyyy')}`;
		}
		const sorted = activeDays(row)
			.map((d) => new Date(d.dayStart))
			.sort((a, b) => a.getTime() - b.getTime());
		const f = (d: Date) => formatInTimeZone(d, row.referenceTimezone, 'MMM d');
		const first = f(sorted[0]);
		const last = f(sorted[sorted.length - 1]);
		return first === last ? first : `${first} – ${last}`;
	}
	const rate = (row: ListRow) => (row.hourlyRate ? `$${row.hourlyRate}/hr` : '—');
	const titleOf = (row: ListRow) => row.title || row.disciplineName;

	const columns = $derived<DataColumn<ListRow>[]>([
		{ id: 'request', header: noun === 'request' ? 'Request' : 'Requisition', cell: requestCell, sortable: true },
		{ id: 'location', header: 'Location', value: (r) => r.locationName, sortable: true },
		{ id: 'dates', header: 'Dates', value: dates, sortable: true, class: 'whitespace-nowrap' },
		{ id: 'rate', header: 'Rate', value: rate, numeric: true, sortable: true },
		{ id: 'status', header: 'Status', cell: statusCell, sortable: true },
		{ id: 'fill', header: tab === 'permanent' ? 'Applicants' : 'Fill', cell: fillCell, sortable: true }
	]);
</script>

{#snippet requestCell(row: ListRow)}
	<span class="flex flex-col gap-1">
		<span class="flex flex-wrap items-center gap-2">
			<span>{titleOf(row)}</span>
			<RequisitionTypePill permanent={row.permanentPosition} />
		</span>
		<span class="text-xs font-normal text-muted-foreground">
			{[`#${row.id}`, row.title && row.title !== row.disciplineName ? row.disciplineName : null, isAdmin ? row.companyName : null].filter(Boolean).join(' · ')}
		</span>
	</span>
{/snippet}

{#snippet statusCell(row: ListRow)}
	<span class="flex flex-wrap gap-1.5">
		<StatusBadge status={row.status} />
		{#if row.unbilled}<StatusBadge status="PAYMENT_REQUIRED" label="Not invoiced" hint="Hired, but no live invoice has been raised for the placement fee." />{/if}
	</span>
{/snippet}

{#snippet fillCell(row: ListRow)}
	{#if row.permanentPosition}
		<a href={`/requisitions/${row.id}?tab=applicants`} class="text-sm hover:underline">
			<span class="font-semibold tabular-nums">{row.applicantCount ?? 0}</span>
			<span class="text-muted-foreground">applicant{row.applicantCount === 1 ? '' : 's'}</span>
		</a>
	{:else}
		{@const p = fillProgress(row)}
		<FillProgress filled={p.filled} total={p.total} />
	{/if}
{/snippet}

{#snippet mobile(row: ListRow)}
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<p class="flex flex-wrap items-center gap-2 font-semibold">
				{titleOf(row)} <RequisitionTypePill permanent={row.permanentPosition} />
			</p>
			<p class="mt-0.5 text-sm text-muted-foreground">
				{[`#${row.id}`, row.locationName, isAdmin ? row.companyName : null].filter(Boolean).join(' · ')}
			</p>
			<p class="text-sm text-muted-foreground">{dates(row)} · {rate(row)}</p>
		</div>
		<StatusBadge status={row.status} />
	</div>
	<div class="mt-2">
		{#if row.permanentPosition}
			<p class="text-sm"><span class="font-semibold tabular-nums">{row.applicantCount ?? 0}</span> <span class="text-muted-foreground">applicants</span></p>
		{:else}
			{@const p = fillProgress(row)}
			<FillProgress filled={p.filled} total={p.total} />
		{/if}
	</div>
{/snippet}

{#snippet tabsSnippet()}
	<TabsWithCounts label="{noun === 'request' ? 'Request' : 'Requisition'} views" active={tab} {tabs} />
{/snippet}

{#snippet toolbar()}
	<div class="flex flex-col gap-3">
		<div class="flex flex-wrap items-end gap-3">
			<div class="relative w-full sm:w-72">
				<Label for="request-search" class="sr-only">Search</Label>
				<Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
				<Input
					id="request-search"
					type="search"
					placeholder="Search title, practice, city, #"
					class="pl-9"
					bind:value={search}
					on:input={onSearchInput}
				/>
			</div>
			<div class="flex items-end gap-2">
				<div>
					<Label for="request-from" class="text-xs text-muted-foreground">From</Label>
					<Input id="request-from" type="date" class="h-9 w-[9.5rem]" bind:value={from} on:change={() => navigate(withParam(url, 'from', from))} />
				</div>
				<div>
					<Label for="request-to" class="text-xs text-muted-foreground">To</Label>
					<Input id="request-to" type="date" class="h-9 w-[9.5rem]" bind:value={to} on:change={() => navigate(withParam(url, 'to', to))} />
				</div>
			</div>
		</div>
		<FilterBar
			{dimensions}
			searchTerm={searchTerm || null}
			on:change={(e) => navigate(setMany({ [e.detail.key]: e.detail.values }))}
			on:clearSearch={() => {
				search = '';
				navigate(withParam(url, 'search', null));
			}}
			on:clearAll={clearAll}
		/>
	</div>
{/snippet}

{#snippet empty()}
	{#if hasFilters}
		<EmptyState icon={Search} title="No matches" description="Nothing in this view matches your search and filters.">
			<Button variant="outline" on:click={clearAll}>Clear filters</Button>
		</EmptyState>
	{:else}
		<EmptyState
			icon={ClipboardList}
			title={tab === 'open' ? `No open ${noun}s` : `Nothing here yet`}
			description={tab === 'open' ? `New ${noun}s show up here until every day is filled.` : `${TAB_LABELS[tab]} ${noun}s will show up here.`}
		/>
	{/if}
{/snippet}

<DataTable
	{rows}
	{columns}
	key={(r) => r.id}
	rowHref={(r) => `/requisitions/${r.id}`}
	rowLabel={(r) => `Open ${noun} #${r.id}, ${titleOf(r)}`}
	{sort}
	sortHref={(c) => sortHrefFor(url, sort, c)}
	pagination={{ page, pageSize, total, href: (p) => pageHrefFor(url, p) }}
	caption="{noun === 'request' ? 'Requests' : 'Requisitions'}"
	tabs={tabsSnippet}
	{toolbar}
	{empty}
	{mobile}
/>
