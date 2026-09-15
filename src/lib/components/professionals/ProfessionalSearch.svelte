<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Avatar, AvatarFallback, AvatarImage } from '$lib/components/ui/avatar';
	import DisciplineCell from '$lib/components/tables/DisciplineCell.svelte';
	import { MapPin, Search, Loader2 } from 'lucide-svelte';
	import { debounce } from '$lib/_helpers/debounce';
	import type { ProfessionalSearchResult } from '$lib/_helpers/professional-search';

	export let requisitionId: number | string | undefined;
	/** Reassign passes the current assignee so they can't be picked again. */
	export let excludeCandidateId: string | null = null;
	export let placeholder = 'Search all professionals by name...';
	/** Bound out so the host can hide its own list while a search is active. */
	export let searching = false;

	let term = '';
	let results: ProfessionalSearchResult[] = [];
	let loading = false;
	let errorMessage: string | null = null;
	/** The query the current `results` belong to, so a slow response can't
	 *  overwrite a newer one. */
	let lastAppliedTerm = '';

	// Below two characters the result set is meaningless, and the server
	// short-circuits anyway — so don't even ask.
	const MIN_CHARS = 2;

	$: searching = term.trim().length >= MIN_CHARS;

	const runSearch = debounce(async (value: string) => {
		const query = value.trim();
		if (query.length < MIN_CHARS) {
			results = [];
			loading = false;
			return;
		}

		if (requisitionId == null) {
			// Nothing to search against — surface it rather than failing silently.
			errorMessage = 'No requisition context';
			results = [];
			return;
		}

		loading = true;
		errorMessage = null;
		try {
			const res = await fetch(
				`/api/requisitions/${requisitionId}/search-professionals?q=${encodeURIComponent(query)}`
			);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data: ProfessionalSearchResult[] = await res.json();
			// Ignore a response that arrived after the box moved on.
			if (query !== term.trim()) return;
			results = data;
			lastAppliedTerm = query;
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Search failed';
			results = [];
		} finally {
			loading = false;
		}
	}, 300);

	function handleInput() {
		if (term.trim().length < MIN_CHARS) {
			results = [];
			errorMessage = null;
		}
		runSearch(term);
	}

	/** Host surfaces call this when a dialog closes or a form resets. */
	export function reset() {
		term = '';
		results = [];
		errorMessage = null;
		loading = false;
		lastAppliedTerm = '';
	}

	$: visible = excludeCandidateId
		? results.filter((p) => p.candidateId !== excludeCandidateId)
		: results;
</script>

<div class="space-y-3">
	<div class="relative">
		<Search
			class="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
		/>
		<Input bind:value={term} on:input={handleInput} {placeholder} class="pl-8" />
		{#if loading}
			<Loader2
				class="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground"
			/>
		{/if}
	</div>

	{#if searching}
		<!-- Stated plainly at the point of use: these results are NOT filtered
		     to the requisition, so an admin can see what they are overriding. -->
		<p class="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
			Searching all active professionals — discipline, experience, pay and distance filters are
			ignored.
		</p>

		{#if errorMessage}
			<p class="text-sm text-red-600">Search failed: {errorMessage}</p>
		{:else if loading && !visible.length}
			<p class="py-6 text-center text-sm text-muted-foreground">Searching…</p>
		{:else if !visible.length && lastAppliedTerm}
			<p class="py-6 text-center text-sm text-muted-foreground">
				No active professionals match “{lastAppliedTerm}”.
			</p>
		{:else}
			<div class="space-y-3">
				{#each visible as professional (professional.candidateId)}
					<div class="rounded-lg border p-4 transition-colors hover:bg-muted/50">
						<div class="flex items-start justify-between gap-4">
							<div class="flex min-w-0 gap-4">
								<Avatar class="h-12 w-12">
									<AvatarImage
										src={professional.avatarUrl}
										alt={`${professional.firstName} ${professional.lastName}`}
									/>
									<AvatarFallback>
										{professional.firstName?.[0]}{professional.lastName?.[0]}
									</AvatarFallback>
								</Avatar>
								<div class="min-w-0 flex-1">
									<h3 class="truncate text-lg font-semibold">
										{professional.firstName}
										{professional.lastName}
									</h3>
									<p class="truncate text-sm text-muted-foreground">{professional.email}</p>
									<div class="mt-2 flex items-center gap-1 text-sm">
										<MapPin class="h-3 w-3 shrink-0" />
										{#if professional.distance}
											<span>{professional.distance} mi away</span>
										{:else}
											<span class="text-muted-foreground">Distance unknown</span>
										{/if}
									</div>
									<div class="mt-2">
										<DisciplineCell disciplines={professional.disciplines ?? []} max={3} />
									</div>
								</div>
							</div>
							<div class="shrink-0">
								<slot {professional} />
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>
