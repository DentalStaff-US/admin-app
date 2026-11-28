<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';
	import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-svelte';
	import { cn } from '$lib/utils';
	import type { DataColumn, Pagination, SortState } from './tableState';
	import { pageSummary } from './tableState';

	let {
		rows,
		columns,
		key,
		rowHref,
		rowLabel,
		sort,
		sortHref,
		pagination,
		caption,
		toolbar,
		tabs,
		empty,
		mobile,
		loading = false,
		class: className
	}: {
		rows: T[];
		columns: DataColumn<T>[];
		/** Stable row identity for keyed rendering. */
		key: (row: T) => string | number;
		/**
		 * Makes the whole row open this record. The first cell holds a real link
		 * stretched over the row, so keyboard, middle-click and screen readers work
		 * (replaces `Table.Row on:click`).
		 */
		rowHref?: (row: T) => string;
		/** Accessible name of that link; defaults to the first cell's text. */
		rowLabel?: (row: T) => string;
		/** Server-side sorting: the current sort and a URL for sorting by a column. */
		sort?: SortState;
		sortHref?: (column: string) => string;
		/** Server-side paging via links, so the page is in the URL. */
		pagination?: Pagination;
		/** Visually hidden table caption (what the table lists). */
		caption: string;
		toolbar?: Snippet;
		tabs?: Snippet;
		empty?: Snippet;
		/** Below md, tables with more than 4 columns render as cards (03 › DataTable). */
		mobile?: Snippet<[T]>;
		loading?: boolean;
		class?: string;
	} = $props();

	const sortIcon = (col: string) => (sort?.column !== col ? ArrowUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown);
	const ariaSort = (col: string) =>
		sort?.column === col ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined;
	const summary = $derived(pagination ? pageSummary(pagination) : null);
</script>

<!-- 03 › DataTable: tabs → toolbar → table → pager, inside one card. -->
<div class={cn('overflow-hidden rounded-lg border bg-card shadow-card', className)}>
	{#if tabs}<div class="border-b px-4 pt-4 sm:px-5">{@render tabs()}</div>{/if}
	{#if toolbar}<div class="border-b px-4 py-3 sm:px-5">{@render toolbar()}</div>{/if}

	{#if loading}
		<div class="divide-y" aria-busy="true" aria-label="Loading">
			{#each Array(5) as _, i (i)}
				<div class="flex gap-4 px-5 py-4">
					<div class="h-4 w-1/4 animate-pulse rounded bg-muted"></div>
					<div class="h-4 w-1/3 animate-pulse rounded bg-muted"></div>
					<div class="h-4 w-1/6 animate-pulse rounded bg-muted"></div>
				</div>
			{/each}
		</div>
	{:else if rows.length === 0}
		<div class="p-4 sm:p-6">
			{#if empty}{@render empty()}{:else}<p class="py-8 text-center text-sm text-muted-foreground">Nothing to show.</p>{/if}
		</div>
	{:else}
		{#if mobile}
			<ul class="divide-y md:hidden">
				{#each rows as row (key(row))}
					<li class="relative px-4 py-3 hover:bg-muted/40">
						{@render mobile(row)}
						{#if rowHref}
							<a href={rowHref(row)} class="absolute inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" aria-label={rowLabel?.(row) ?? 'Open'}></a>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
		<div class={cn('overflow-x-auto', mobile && 'hidden md:block')}>
			<table class="w-full text-sm">
				<caption class="sr-only">{caption}</caption>
				<thead class="bg-muted/50 text-left">
					<tr>
						{#each columns as col (col.id)}
							<th
								scope="col"
								aria-sort={ariaSort(col.id)}
								class={cn(
									'whitespace-nowrap px-4 py-3 text-overline font-bold uppercase text-muted-foreground',
									col.numeric && 'text-right',
									col.headerClass
								)}
							>
								{#if col.sortable && sortHref}
									{@const Icon = sortIcon(col.id)}
									<a href={sortHref(col.id)} class="inline-flex items-center gap-1 rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
										{col.header}
										<Icon class="size-3.5" aria-hidden="true" />
									</a>
								{:else if col.srOnlyHeader}
									<span class="sr-only">{col.header}</span>
								{:else}
									{col.header}
								{/if}
							</th>
						{/each}
					</tr>
				</thead>
				<tbody class="divide-y">
					{#each rows as row (key(row))}
						<tr class={cn('align-middle', rowHref && 'relative hover:bg-muted/40')}>
							{#each columns as col, i (col.id)}
								<td class={cn('px-4 py-3', col.numeric && 'text-right tabular-nums', col.class)}>
									{#if i === 0 && rowHref}
										<a
											href={rowHref(row)}
											aria-label={rowLabel?.(row)}
											class="font-semibold after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring"
										>
											{#if col.cell}{@render col.cell(row)}{:else}{col.value?.(row) ?? ''}{/if}
										</a>
									{:else if col.cell}
										<!-- Interactive cells (menus, buttons) sit above the row link. -->
										<div class="relative z-10">{@render col.cell(row)}</div>
									{:else}
										{col.value?.(row) ?? ''}
									{/if}
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	{#if pagination && summary && rows.length > 0}
		<div class="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm sm:px-5">
			<p class="text-muted-foreground">{summary.text}</p>
			<div class="flex gap-2">
				<a
					href={summary.prev ? pagination.href(pagination.page - 1) : undefined}
					aria-disabled={!summary.prev}
					class={cn(
						'inline-flex h-9 items-center gap-1 rounded-md border px-3 font-semibold',
						summary.prev ? 'hover:bg-accent' : 'pointer-events-none opacity-50'
					)}
				>
					<ChevronLeft class="size-4" aria-hidden="true" /> Previous
				</a>
				<a
					href={summary.next ? pagination.href(pagination.page + 1) : undefined}
					aria-disabled={!summary.next}
					class={cn(
						'inline-flex h-9 items-center gap-1 rounded-md border px-3 font-semibold',
						summary.next ? 'hover:bg-accent' : 'pointer-events-none opacity-50'
					)}
				>
					Next <ChevronRight class="size-4" aria-hidden="true" />
				</a>
			</div>
		</div>
	{/if}
</div>
