<script lang="ts">
	import { goto } from '$app/navigation';
	import { Columns, Rows, Workflow } from 'lucide-svelte';
	import DataTable from '$dtss/DataTable.svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import Page from '$dtss/Page.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';
	import StatusBadge from '$dtss/StatusBadge.svelte';
	import TabsWithCounts from '$dtss/TabsWithCounts.svelte';
	import { withParam, type DataColumn } from '$dtss/tableState';
	import FilterBar from '$lib/components/filters/FilterBar.svelte';
	import type { FilterDimension } from '$lib/components/filters/types';
	import { cn } from '$lib/utils';
	import type { PipelineRow } from '../server/permanent';
	import { boardColumn, FEE_LABEL, LIFECYCLE_STEPS, type FeeState, type LifecycleStep } from '../permanentLifecycle';
	import type { FacetOption } from '../requestList';

	let {
		url,
		tab,
		view,
		rows,
		tabCounts,
		facets
	}: {
		url: URL;
		tab: 'active' | 'done';
		view: 'table' | 'board';
		rows: PipelineRow[];
		tabCounts: { active: number; done: number };
		facets: Record<'location' | 'discipline' | 'practice', FacetOption[]>;
	} = $props();

	const selected = (name: string) => (url.searchParams.get(name) ?? '').split(',').filter(Boolean);
	const dimensions = $derived<FilterDimension[]>([
		{ key: 'location', label: 'Location', options: facets.location, selected: selected('location') },
		{ key: 'discipline', label: 'Discipline', options: facets.discipline, selected: selected('discipline') },
		{ key: 'practice', label: 'Practice', options: facets.practice, selected: selected('practice') }
	]);
	const go = (href: string) => goto(href, { keepFocus: true, noScroll: true });
	const setList = (key: string, values: string[]) => go(withParam(url, key, values.join(',')));
	function clearAll() {
		const next = new URL(url);
		for (const k of ['location', 'discipline', 'practice']) next.searchParams.delete(k);
		go(`${next.pathname}${next.search}`);
	}

	// Every count links to exactly the set it counts (10 §5).
	const stageHref = (r: PipelineRow, stage: string) => `/requisitions/${r.id}?tab=applicants&stage=${stage}`;
	const title = (r: PipelineRow) => r.title || r.disciplineName;
	const FEE_STATUS: Record<FeeState, string | null> = {
		NONE: null,
		NOT_INVOICED: 'PAYMENT_REQUIRED',
		INVOICED: 'PENDING',
		RECEIVED: 'PAYMENT_RECEIVED'
	};

	const columns: DataColumn<PipelineRow>[] = [
		{ id: 'request', header: 'Request', cell: requestCell },
		{ id: 'interested', header: 'Interested', numeric: true, cell: interestedCell },
		{ id: 'applied', header: 'Applied', numeric: true, cell: appliedCell },
		{ id: 'recommended', header: 'Recommended', numeric: true, cell: recommendedCell },
		{ id: 'hired', header: 'Hired', numeric: true, cell: hiredCell },
		{ id: 'fee', header: 'Fee', cell: feeCell }
	];

	const STEP_LABEL: Record<LifecycleStep, string> = {
		POSTED: 'Posted',
		INTERESTED: 'Interested',
		APPLIED: 'Applied',
		HIRED: 'Hired',
		FEE: 'Fee received'
	};
	const board = $derived(
		LIFECYCLE_STEPS.map((step) => ({ step, items: rows.filter((r) => boardColumn(r.status, r.counts) === step) }))
	);
</script>

{#snippet countSnippet(args: { row: PipelineRow; stage: string; n: number })}
	{#if args.n > 0}
		<a href={stageHref(args.row, args.stage)} class="font-bold tabular-nums text-primary-dark hover:underline">
			{args.n}<span class="sr-only"> {args.stage}</span>
		</a>
	{:else}
		<span class="tabular-nums text-muted-foreground">0</span>
	{/if}
{/snippet}

{#snippet interestedCell(r: PipelineRow)}{@render countSnippet({ row: r, stage: 'interested', n: r.counts.interested })}{/snippet}
{#snippet appliedCell(r: PipelineRow)}{@render countSnippet({ row: r, stage: 'applied', n: r.counts.applied })}{/snippet}
{#snippet recommendedCell(r: PipelineRow)}{@render countSnippet({ row: r, stage: 'recommended', n: r.counts.recommended })}{/snippet}
{#snippet hiredCell(r: PipelineRow)}{@render countSnippet({ row: r, stage: 'hired', n: r.counts.hired })}{/snippet}

{#snippet requestCell(r: PipelineRow)}
	<span class="flex flex-col">
		<span>#{r.id} · {title(r)}</span>
		<span class="text-xs font-normal text-muted-foreground">{r.companyName} · {r.locationName}</span>
	</span>
{/snippet}

{#snippet feeCell(r: PipelineRow)}
	{#if FEE_STATUS[r.fee]}
		<a href={`/requisitions/${r.id}?tab=billing`}><StatusBadge status={FEE_STATUS[r.fee]} label={FEE_LABEL[r.fee]} /></a>
	{:else}
		<span class="text-muted-foreground">—</span>
	{/if}
{/snippet}

{#snippet mobile(r: PipelineRow)}
	<p class="font-semibold">#{r.id} · {title(r)}</p>
	<p class="text-sm text-muted-foreground">{r.companyName} · {r.locationName}</p>
	<dl class="mt-2 grid grid-cols-4 gap-2 text-center text-sm">
		{#each [['Interested', r.counts.interested], ['Applied', r.counts.applied], ['Recomm.', r.counts.recommended], ['Hired', r.counts.hired]] as [label, n] (label)}
			<div class="rounded-md bg-muted px-1 py-1.5">
				<dt class="text-caption text-muted-foreground">{label}</dt>
				<dd class="font-bold tabular-nums">{n}</dd>
			</div>
		{/each}
	</dl>
{/snippet}

{#snippet tabsSnippet()}
	<div class="flex flex-wrap items-center justify-between gap-3 pb-3">
		<TabsWithCounts
			label="Pipeline views"
			active={tab}
			tabs={[
				{ value: 'active', label: 'In progress', count: tabCounts.active, href: withParam(url, 'tab', null) },
				{ value: 'done', label: 'Done', count: tabCounts.done, href: withParam(url, 'tab', 'done') }
			]}
		/>
	</div>
{/snippet}

{#snippet toolbar()}
	<FilterBar
		{dimensions}
		on:change={(e) => setList(e.detail.key, e.detail.values)}
		on:clearAll={clearAll}
	/>
{/snippet}

{#snippet empty()}
	<EmptyState icon={Workflow} title="No permanent requests here" description="Permanent requests show up here from posting until the fee is received." />
{/snippet}

<Page width={view === 'board' ? 'full' : 'default'}>
	<PageHeader title="Permanent pipeline" description="Every permanent request from posting to fee received. Each count opens exactly those people.">
		{#snippet actions()}
			<div role="group" aria-label="Layout" class="inline-flex rounded-md bg-muted p-1">
				{#each [['table', 'Table', Rows], ['board', 'Board', Columns]] as const as [value, label, Icon] (value)}
					<a
						href={withParam(url, 'view', value === 'table' ? null : value)}
						aria-current={view === value ? 'page' : undefined}
						class={cn(
							'inline-flex h-8 items-center gap-2 rounded-sm px-3 text-sm font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
							view === value && 'bg-background text-foreground shadow-card'
						)}
					>
						<Icon class="size-4" aria-hidden="true" /> {label}
					</a>
				{/each}
			</div>
		{/snippet}
	</PageHeader>

	{#if view === 'table'}
		<DataTable
			{rows}
			{columns}
			key={(r) => r.id}
			rowHref={(r) => `/requisitions/${r.id}`}
			rowLabel={(r) => `Open request #${r.id}, ${title(r)} at ${r.companyName}`}
			caption="Permanent requests by stage"
			tabs={tabsSnippet}
			{toolbar}
			{empty}
			{mobile}
		/>
	{:else}
		<div class="rounded-lg border bg-card shadow-card">
			<div class="border-b px-4 pt-4 sm:px-5">{@render tabsSnippet()}</div>
			<div class="border-b px-4 py-3 sm:px-5">{@render toolbar()}</div>
			<!-- Board: one column per stage, for the coordinator's weekly review. -->
			<div class="grid gap-4 p-4 sm:p-5 md:grid-cols-3 xl:grid-cols-5">
				{#each board as col (col.step)}
					<section aria-labelledby={`col-${col.step}`} class="rounded-lg bg-muted/50 p-3">
						<h2 id={`col-${col.step}`} class="flex items-center justify-between text-overline uppercase text-muted-foreground">
							{STEP_LABEL[col.step]} <span class="tabular-nums">{col.items.length}</span>
						</h2>
						<ul class="mt-3 space-y-2">
							{#each col.items as r (r.id)}
								<li class="relative rounded-lg border bg-card p-3 shadow-card transition hover:border-primary/40 hover:shadow-lift">
									<a href={`/requisitions/${r.id}`} class="text-sm font-bold after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring">
										{title(r)}
									</a>
									<p class="text-xs text-muted-foreground">#{r.id} · {r.companyName}</p>
									<p class="relative z-10 mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
										<a class="hover:underline" href={stageHref(r, 'interested')}><b class="tabular-nums">{r.counts.interested}</b> interested</a>
										<a class="hover:underline" href={stageHref(r, 'applied')}><b class="tabular-nums">{r.counts.applied + r.counts.recommended}</b> applied</a>
										{#if r.counts.hired}<a class="hover:underline" href={stageHref(r, 'hired')}><b class="tabular-nums">{r.counts.hired}</b> hired</a>{/if}
									</p>
									{#if FEE_STATUS[r.fee]}
										<div class="relative z-10 mt-2">
											<StatusBadge status={FEE_STATUS[r.fee]} label={FEE_LABEL[r.fee]} />
										</div>
									{/if}
								</li>
							{:else}
								<li class="py-4 text-center text-xs text-muted-foreground">None</li>
							{/each}
						</ul>
					</section>
				{/each}
			</div>
		</div>
	{/if}
</Page>
