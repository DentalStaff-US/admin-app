<script lang="ts">
	// The scope is always visible (10 §4.2 rule 2). When there's more than one
	// location to choose from, the chip is also the location filter (§4.1).
	import { Check, ChevronDown, Info, MapPin } from 'lucide-svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Popover from '$lib/components/ui/popover';
	import { scopeHint } from '../scope';
	import type { DashboardScope } from '../types';

	let { scope, hrefFor }: { scope: DashboardScope; hrefFor: (locationId: string | null) => string } = $props();

	const choices = $derived(scope.availableLocations);
	const canChoose = $derived(choices.length > 1);
	const current = $derived(scope.chosen ? scope.locations[0]?.id ?? null : null);
	const chip =
		'inline-flex h-10 max-w-64 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-semibold hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
</script>

{#if canChoose}
	<DropdownMenu.Root>
		<DropdownMenu.Trigger class={chip} aria-label="Locations shown: {scope.label}. Change">
			<MapPin class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
			<span class="truncate">{scope.chosen ? scope.label : scope.kind === 'company' ? 'All locations' : scope.label}</span>
			<ChevronDown class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="end" class="w-64">
			<p class="px-2 py-1.5 text-xs text-muted-foreground">{scopeHint(scope)}</p>
			<DropdownMenu.Separator />
			<DropdownMenu.Item href={hrefFor(null)} class="gap-2">
				<Check class="size-4 {current === null ? '' : 'invisible'}" aria-hidden="true" />
				{scope.locationIds === null ? 'All locations' : 'All my locations'}
			</DropdownMenu.Item>
			{#each choices as l (l.id)}
				<DropdownMenu.Item href={hrefFor(l.id)} class="gap-2">
					<Check class="size-4 {current === l.id ? '' : 'invisible'}" aria-hidden="true" />
					<span class="truncate">{l.name}</span>
				</DropdownMenu.Item>
			{/each}
		</DropdownMenu.Content>
	</DropdownMenu.Root>
{:else}
	<!-- InfoHint: tap-safe explanation of what the numbers cover (03 › InfoHint). -->
	<Popover.Root>
		<Popover.Trigger class={chip} aria-label="Locations shown: {scope.label}. What does this mean?">
			<MapPin class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
			<span class="truncate">{scope.label}</span>
			<Info class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
		</Popover.Trigger>
		<Popover.Content align="end" class="w-64 text-sm">{scopeHint(scope)}</Popover.Content>
	</Popover.Root>
{/if}
