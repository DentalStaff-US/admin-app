<script lang="ts">
	import * as Tooltip from '$lib/components/ui/tooltip/';
	import { badgeVariants } from '$lib/components/ui/badge';
	import { cn } from '$lib/utils';
	import {
		formatLocationSummary,
		locationSummaryKey,
		type LocationSummary
	} from '$lib/_helpers/client-filters';

	export let locations: LocationSummary[] = [];
	/** City and state values matching the active filters — highlighted so the
	 *  office that matched is obvious on a multi-office client. */
	export let highlightCities: string[] = [];
	export let highlightStates: string[] = [];
	export let max = 2;

	// City comparison is case-insensitive to match the query predicate.
	$: highlightedCities = new Set(highlightCities.map((city) => city.toLowerCase()));
	$: highlightedStates = new Set(highlightStates);

	const isHighlighted = (
		location: LocationSummary,
		cities: Set<string>,
		states: Set<string>
	): boolean =>
		Boolean(
			(location.city && cities.has(location.city.toLowerCase())) ||
				(location.state && states.has(location.state))
		);

	$: visible = locations.slice(0, max);
	$: overflow = locations.slice(max);
</script>

{#if !locations.length}
	<span class="text-muted-foreground">—</span>
{:else}
	<div class="flex flex-wrap items-center gap-1">
		{#each visible as location (locationSummaryKey(location))}
			<Tooltip.Root openDelay={200}>
				<Tooltip.Trigger asChild let:builder>
					<span
						use:builder.action
						{...builder}
						class={cn(
							badgeVariants({
								variant: isHighlighted(location, highlightedCities, highlightedStates)
									? 'default'
									: 'secondary'
							}),
							'font-medium whitespace-nowrap'
						)}
					>
						{formatLocationSummary(location)}
					</span>
				</Tooltip.Trigger>
				<Tooltip.Content>
					<p>{formatLocationSummary(location)}</p>
				</Tooltip.Content>
			</Tooltip.Root>
		{/each}

		{#if overflow.length}
			<Tooltip.Root openDelay={200}>
				<Tooltip.Trigger asChild let:builder>
					<span
						use:builder.action
						{...builder}
						class={cn(
							badgeVariants({
								variant: overflow.some((entry) =>
									isHighlighted(entry, highlightedCities, highlightedStates)
								)
									? 'default'
									: 'outline'
							}),
							'font-medium'
						)}
					>
						+{overflow.length}
					</span>
				</Tooltip.Trigger>
				<Tooltip.Content>
					<p>{overflow.map((entry) => formatLocationSummary(entry)).join(', ')}</p>
				</Tooltip.Content>
			</Tooltip.Root>
		{/if}
	</div>
{/if}
