<script lang="ts">
	/**
	 * DataTable toolbar (03 › FilterBar): instant, debounced search and the
	 * shared filter dropdowns, all kept in the URL so a view can be shared. The
	 * separate "Search" button is retired. Shared by timesheets and invoices.
	 */
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { Search } from 'lucide-svelte';
	import FilterBar from '$lib/components/filters/FilterBar.svelte';
	import type { FilterDimension } from '$lib/components/filters/types';
	import { Input } from '$lib/components/ui/input';
	import { withParam } from '$dtss/tableState';

	let {
		url,
		search = '',
		placeholder,
		dimensions = [],
		debounceMs = 300
	}: {
		url: URL;
		search?: string;
		placeholder: string;
		dimensions?: FilterDimension[];
		debounceMs?: number;
	} = $props();

	let term = $state(untrack(() => search));
	let timer: ReturnType<typeof setTimeout> | undefined;

	// Follow the URL when it changes underneath us (back button, Clear all).
	$effect(() => {
		const next = search;
		untrack(() => {
			if (next !== term.trim()) term = next;
		});
	});

	const go = (href: string) => goto(href, { keepFocus: true, noScroll: true, replaceState: true });

	function onSearch(value: string) {
		term = value;
		clearTimeout(timer);
		timer = setTimeout(() => go(withParam(url, 'search', value.trim())), debounceMs);
	}

	function onFilter(key: string, values: string[]) {
		go(withParam(url, key, values.join(',')));
	}

	function clearAll() {
		const next = new URL(url);
		for (const d of dimensions) next.searchParams.delete(d.key);
		next.searchParams.delete('search');
		next.searchParams.delete('page');
		go(`${next.pathname}${next.search}`);
	}
</script>

<div class="flex flex-col gap-3 lg:flex-row lg:items-start">
	<div class="relative w-full lg:max-w-xs">
		<Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
		<Input type="search" value={term} {placeholder} aria-label={placeholder} class="h-9 pl-9" on:input={(e) => onSearch(e.currentTarget.value)} />
	</div>
	<div class="min-w-0 flex-1">
		<FilterBar
			{dimensions}
			searchTerm={search || null}
			on:change={(e) => onFilter(e.detail.key, e.detail.values)}
			on:clearSearch={() => {
				term = '';
				go(withParam(url, 'search', null));
			}}
			on:clearAll={clearAll}
		/>
	</div>
</div>
