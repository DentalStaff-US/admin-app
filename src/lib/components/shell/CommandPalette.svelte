<script lang="ts">
	import { goto } from '$app/navigation';
	import { Briefcase, Building2, Hash, UserRound } from 'lucide-svelte';
	import * as Command from '$lib/components/ui/command';
	import type { NavGroup } from '$lib/nav/nav';

	type Hit = { kind: 'professional' | 'client' | 'requisition'; label: string; detail: string; href: string };

	let {
		open = $bindable(false),
		groups,
		canSearch = false
	}: {
		open?: boolean;
		groups: NavGroup[];
		/** DTSS admins: search professionals, practices and requisitions by name or number. */
		canSearch?: boolean;
	} = $props();

	let query = $state('');
	let hits = $state<Hit[]>([]);
	let searching = $state(false);

	const items = $derived(groups.flatMap((g) => g.items));
	const needle = $derived(query.trim().toLowerCase());
	const pages = $derived(needle ? items.filter((i) => i.label.toLowerCase().includes(needle)) : items);
	const requestNumber = $derived(/^#?\d+$/.test(query.trim()) ? query.trim().replace('#', '') : null);
	const hasRequests = $derived(items.some((i) => i.href === '/requisitions'));

	// Debounced server search; the latest query wins.
	let timer: ReturnType<typeof setTimeout> | undefined;
	let latest = 0;
	$effect(() => {
		const q = query.trim();
		clearTimeout(timer);
		if (!canSearch || q.replace('#', '').length < 2) {
			hits = [];
			searching = false;
			return;
		}
		searching = true;
		const ticket = ++latest;
		timer = setTimeout(async () => {
			try {
				const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
				const body = res.ok ? await res.json() : { hits: [] };
				if (ticket === latest) hits = body.hits ?? [];
			} catch {
				if (ticket === latest) hits = [];
			} finally {
				if (ticket === latest) searching = false;
			}
		}, 200);
	});

	$effect(() => {
		if (!open) query = '';
	});

	function go(href: string) {
		open = false;
		goto(href);
	}

	const iconFor = { requisition: Briefcase, professional: UserRound, client: Building2 } as const;
</script>

<!-- 05 › Top bar: ⌘K jumps anywhere. Filtering is ours (shouldFilter off) so server hits aren't hidden. -->
<Command.Dialog bind:open shouldFilter={false} loop>
	<Command.Input
		bind:value={query}
		placeholder={canSearch ? 'Search people, practices, requisitions or pages…' : 'Go to a page or requisition number…'}
	/>
	<Command.List class="max-h-[60vh]">
		{#if requestNumber && hasRequests}
			<Command.Group heading="Jump to">
				<Command.Item value={`req-${requestNumber}`} onSelect={() => go(`/requisitions/${requestNumber}`)}>
					<Hash class="mr-2 size-4" aria-hidden="true" /> Requisition #{requestNumber}
				</Command.Item>
			</Command.Group>
		{/if}
		{#if hits.length > 0}
			<Command.Group heading="Results">
				{#each hits as hit (hit.href)}
					{@const Icon = iconFor[hit.kind]}
					<Command.Item value={hit.href} onSelect={() => go(hit.href)}>
						<Icon class="mr-2 size-4 shrink-0" aria-hidden="true" />
						<span class="truncate font-semibold">{hit.label}</span>
						{#if hit.detail}<span class="ml-2 truncate text-xs text-muted-foreground">{hit.detail}</span>{/if}
					</Command.Item>
				{/each}
			</Command.Group>
		{/if}
		{#if pages.length > 0}
			<Command.Group heading="Pages">
				{#each pages as item (item.href)}
					<Command.Item value={`page-${item.href}`} onSelect={() => go(item.href)}>
						<item.icon class="mr-2 size-4" aria-hidden="true" />
						{item.label}
					</Command.Item>
				{/each}
			</Command.Group>
		{/if}
		{#if !requestNumber && hits.length === 0 && pages.length === 0}
			<div class="py-6 text-center text-sm text-muted-foreground">
				{searching ? 'Searching…' : 'Nothing matches.'}
			</div>
		{/if}
	</Command.List>
</Command.Dialog>
