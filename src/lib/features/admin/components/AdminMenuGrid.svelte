<script lang="ts">
	import { Search, SearchX } from 'lucide-svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import IconSquare from '$dtss/IconSquare.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { filterAdminMenu, groupAdminMenu, type AdminMenuItem } from '../menu';

	let { items }: { items: AdminMenuItem<any>[] } = $props();

	let query = $state('');
	const groups = $derived(groupAdminMenu(filterAdminMenu(items, query)));
</script>

<!-- 06 › Admin menu: IconSquare cards grouped by area, replacing the list of blue links. -->
<div class="space-y-8">
	<div class="relative max-w-sm">
		<Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
		<Input type="search" bind:value={query} placeholder="Find a tool" aria-label="Find an admin tool" class="pl-9" />
	</div>

	{#each groups as group (group.area)}
		<section aria-labelledby="admin-area-{group.area}">
			<h2 id="admin-area-{group.area}" class="mb-3 text-overline font-bold uppercase text-muted-foreground">{group.area}</h2>
			<ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each group.items as item (item.href)}
					<li
						class="relative flex items-start gap-4 rounded-lg border bg-card p-5 shadow-card transition duration-fast hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lift"
					>
						<IconSquare icon={item.icon} />
						<div class="min-w-0">
							<a
								href={item.href}
								class="font-bold text-foreground after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
							>
								{item.label}
							</a>
							<p class="mt-0.5 text-sm text-muted-foreground">{item.description}</p>
						</div>
					</li>
				{/each}
			</ul>
		</section>
	{:else}
		<EmptyState icon={SearchX} title="No tools match “{query}”" description="Try another word, or clear the search to see every tool.">
			<Button variant="outline" on:click={() => (query = '')}>Clear search</Button>
		</EmptyState>
	{/each}
</div>
