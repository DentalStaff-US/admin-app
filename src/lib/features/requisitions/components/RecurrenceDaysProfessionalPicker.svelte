<script lang="ts">
	// Legacy syntax on purpose: the bits-ui 0.x Popover trigger needs let:builder.
	// Admin-only: optionally assign a professional to the new day(s) on creation.
	import { Check, ChevronsUpDown, Loader2, MapPin } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Command from '$lib/components/ui/command';
	import * as Popover from '$lib/components/ui/popover';
	import { cn } from '$lib/utils';
	import DisciplineCell from '$lib/components/tables/DisciplineCell.svelte';
	import { debounce } from '$lib/_helpers/debounce';
	import type { ProfessionalSearchResult } from '$lib/_helpers/professional-search';

	type QualifiedPro = {
		candidateId: string;
		firstName: string;
		lastName: string;
		distance?: string | number;
		disciplineAbbr?: string;
	};

	export let requisitionId: number | string;
	export let qualifiedProfessionals: QualifiedPro[] = [];
	/** '' = leave open and notify every qualified professional. */
	export let selectedCandidateId = '';
	/** "First Last" of the pick, for the review summary and the availability prompt. */
	export let selectedName: string | null = null;

	let comboOpen = false;
	// cmdk scores and reorders its items, which floated "Leave open" into the
	// middle of the results, so we filter ourselves (shouldFilter={false}) and
	// keep it pinned first.
	let comboQuery = '';
	let searchedPro: ProfessionalSearchResult | null = null;

	// The query also hits the server, so typing a name finds ANY active
	// professional, not just the qualified ones already loaded. Server results
	// render outside cmdk's filtering so the server's matching stays authoritative.
	let serverResults: ProfessionalSearchResult[] = [];
	let serverLoading = false;
	let serverError: string | null = null;
	let lastSearchedTerm = '';

	// "Show more": candidates outside the experience/pay/skills filters, on demand.
	let extendedProfessionals: QualifiedPro[] = [];
	let loadingExtended = false;
	let extendedLoaded = false;
	let extendedError: string | null = null;

	$: allProfessionals = [...qualifiedProfessionals, ...extendedProfessionals];
	$: comboFiltered = comboQuery.trim()
		? allProfessionals.filter((pro) =>
				`${pro.firstName ?? ''} ${pro.lastName ?? ''} ${pro.disciplineAbbr ?? ''}`
					.toLowerCase()
					.includes(comboQuery.trim().toLowerCase())
			)
		: allProfessionals;
	$: otherResults = serverResults.filter(
		(r) => !comboFiltered.some((p) => p.candidateId === r.candidateId)
	);
	$: selectedPro = allProfessionals.find((p) => p.candidateId === selectedCandidateId) ?? null;
	$: picked =
		searchedPro && searchedPro.candidateId === selectedCandidateId ? searchedPro : selectedPro;
	$: selectedName = picked ? `${picked.firstName} ${picked.lastName}` : null;
	$: triggerLabel = picked
		? `${picked.firstName} ${picked.lastName}${picked.distance ? ` · ${picked.distance} mi` : ''}`
		: null;

	const runServerSearch = debounce(async (value: string) => {
		const query = value.trim();
		if (query.length < 2) {
			serverResults = [];
			serverError = null;
			serverLoading = false;
			lastSearchedTerm = '';
			return;
		}
		serverLoading = true;
		serverError = null;
		try {
			const res = await fetch(
				`/api/requisitions/${requisitionId}/search-professionals?q=${encodeURIComponent(query)}`
			);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data: ProfessionalSearchResult[] = await res.json();
			// Drop a response that landed after the box moved on.
			if (query !== comboQuery.trim()) return;
			serverResults = data;
			lastSearchedTerm = query;
		} catch (err) {
			serverError = err instanceof Error ? err.message : 'Search failed';
			serverResults = [];
			lastSearchedTerm = query;
		} finally {
			serverLoading = false;
		}
	}, 300);

	// Reactive, not on:input: the shadcn Command.Input wrapper forwards no DOM events.
	$: runServerSearch(comboQuery);
	// True from the first keystroke so the list shows a loader, not "no matches".
	$: serverPending =
		comboQuery.trim().length >= 2 && (serverLoading || comboQuery.trim() !== lastSearchedTerm);

	async function loadAllExperienceCandidates() {
		if (loadingExtended || extendedLoaded) return;
		loadingExtended = true;
		extendedError = null;
		try {
			const res = await fetch(
				`/api/requisitions/${requisitionId}/qualified-candidates?includeAllExperience=true&includeOutsidePayRange=true&includeMissingSkills=true`
			);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const all: QualifiedPro[] = await res.json();
			const existingIds = new Set(qualifiedProfessionals.map((p) => p.candidateId));
			extendedProfessionals = all.filter((p) => !existingIds.has(p.candidateId));
			extendedLoaded = true;
		} catch (err) {
			extendedError = err instanceof Error ? err.message : 'Failed to load';
		} finally {
			loadingExtended = false;
		}
	}

	function choose(id: string, fromSearch: ProfessionalSearchResult | null = null) {
		selectedCandidateId = id;
		searchedPro = fromSearch;
		comboOpen = false;
	}
</script>

<div class="space-y-2">
	<div>
		<p class="text-sm font-semibold" id="assign-pro-label">Assign a professional <span class="font-normal text-muted-foreground">(optional)</span></p>
		<p class="mt-0.5 text-sm text-muted-foreground">
			Assigning marks the days Filled and sends that professional one notification to log in and
			confirm their start times. Leave it open to notify everyone qualified.
		</p>
	</div>

	<Popover.Root bind:open={comboOpen}>
		<Popover.Trigger asChild let:builder>
			<Button
				builders={[builder]}
				variant="outline"
				role="combobox"
				aria-expanded={comboOpen}
				aria-labelledby="assign-pro-label"
				class="w-full justify-between font-normal"
			>
				{#if triggerLabel}
					<span class="truncate">{triggerLabel}</span>
				{:else}
					<span class="text-muted-foreground">Leave open (notify all qualified)</span>
				{/if}
				<ChevronsUpDown class="ml-2 size-4 shrink-0 opacity-50" />
			</Button>
		</Popover.Trigger>
		<Popover.Content class="w-[min(22rem,calc(100vw-2rem))] p-0" align="start">
			<Command.Root shouldFilter={false}>
				<Command.Input bind:value={comboQuery} placeholder="Search professionals by name…" />
				<Command.List>
					<Command.Group>
						<Command.Item value="leave open unassigned notify all qualified" onSelect={() => choose('')}>
							<Check class={cn('mr-2 size-4', selectedCandidateId === '' ? 'opacity-100' : 'opacity-0')} />
							Leave open (notify all qualified)
						</Command.Item>
						{#each comboFiltered as pro (pro.candidateId)}
							<Command.Item
								value={`${pro.firstName} ${pro.lastName} ${pro.disciplineAbbr ?? ''}`}
								onSelect={() => choose(pro.candidateId)}
							>
								<Check
									class={cn('mr-2 size-4 shrink-0', selectedCandidateId === pro.candidateId ? 'opacity-100' : 'opacity-0')}
								/>
								<div class="flex min-w-0 flex-col">
									<span class="truncate">{pro.firstName} {pro.lastName}</span>
									<span class="flex items-center gap-2 text-xs text-muted-foreground">
										{#if pro.distance}
											<span class="flex items-center gap-0.5"><MapPin class="size-3" aria-hidden="true" />{pro.distance} mi</span>
										{/if}
										{#if pro.disciplineAbbr}<span>{pro.disciplineAbbr}</span>{/if}
									</span>
								</div>
							</Command.Item>
						{/each}
					</Command.Group>

					{#if comboQuery.trim().length >= 2}
						{#if serverPending}
							<div class="flex items-center justify-center gap-2 border-t px-3 py-3 text-sm text-muted-foreground">
								<Loader2 class="size-4 animate-spin" aria-hidden="true" />
								Searching all professionals…
							</div>
						{:else if otherResults.length}
							<Command.Group heading="Other active professionals (filters ignored)">
								{#each otherResults as pro (pro.candidateId)}
									<Command.Item value={pro.candidateId} onSelect={() => choose(pro.candidateId, pro)}>
										<Check
											class={cn('mr-2 size-4 shrink-0', selectedCandidateId === pro.candidateId ? 'opacity-100' : 'opacity-0')}
										/>
										<div class="flex min-w-0 flex-col gap-1">
											<span class="truncate">{pro.firstName} {pro.lastName}</span>
											<span class="flex items-center gap-0.5 text-xs text-muted-foreground">
												<MapPin class="size-3" aria-hidden="true" />
												{pro.distance ? `${pro.distance} mi` : 'Distance unknown'}
											</span>
											<DisciplineCell disciplines={pro.disciplines ?? []} max={3} />
										</div>
									</Command.Item>
								{/each}
							</Command.Group>
						{:else if !comboFiltered.length}
							<p class="px-3 py-4 text-center text-sm text-muted-foreground">No professional found.</p>
						{/if}
						{#if serverError}
							<p class="px-3 py-1 text-xs text-destructive">Search failed: {serverError}</p>
						{/if}
					{/if}

					{#if !extendedLoaded}
						<div class="border-t p-1">
							<Button
								variant="ghost"
								size="sm"
								class="h-auto w-full justify-start whitespace-normal px-2 py-1.5 text-left font-semibold text-primary-dark"
								on:click={loadAllExperienceCandidates}
								disabled={loadingExtended}
							>
								{loadingExtended ? 'Loading…' : 'Show more: include people outside the pay range or experience level'}
							</Button>
							{#if extendedError}
								<p class="px-2 py-1 text-xs text-destructive">Failed to load: {extendedError}</p>
							{/if}
						</div>
					{:else}
						<p class="border-t px-3 py-1.5 text-xs text-muted-foreground">
							Showing people outside the pay range or experience level too.
						</p>
					{/if}
				</Command.List>
			</Command.Root>
		</Popover.Content>
	</Popover.Root>
</div>
