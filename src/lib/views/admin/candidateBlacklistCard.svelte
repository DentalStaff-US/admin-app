<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Ban, Search, Trash2, UserX } from 'lucide-svelte';
	import { format } from 'date-fns';

	export let blacklistedCandidates: {
		candidateId: string;
		firstName: string | null;
		lastName: string | null;
		email: string;
		avatarUrl: string | null;
		createdAt: Date | string;
	}[] = [];

	// Last search result / error, read from the page `form` prop by the parent.
	export let searchResult: {
		candidateId: string;
		firstName: string | null;
		lastName: string | null;
		email: string;
		avatarUrl: string | null;
	} | null = null;
	export let searchError: string | null = null;

	export let searchAction: string;
	export let addAction: string;
	export let removeAction: string;

	let searchEmail = '';
	let searching = false;

	function initials(first: string | null, last: string | null): string {
		return `${first?.[0] ?? ''}${last?.[0] ?? ''}` || '?';
	}

	// Hide a stale search result once that candidate is already blacklisted.
	$: alreadyBlacklisted =
		!!searchResult &&
		blacklistedCandidates.some((c) => c.candidateId === searchResult?.candidateId);
</script>

<div class="space-y-4">
	<!-- Search by email -->
	<form
		method="POST"
		action={searchAction}
		use:enhance={() => {
			searching = true;
			return async ({ update }) => {
				searching = false;
				await update();
			};
		}}
		class="flex gap-2"
	>
		<Input
			name="email"
			type="email"
			bind:value={searchEmail}
			placeholder="Search candidate by email..."
			class="text-sm"
		/>
		<Button type="submit" size="sm" variant="outline" disabled={searching || !searchEmail.trim()}>
			<Search class="h-4 w-4" />
		</Button>
	</form>

	{#if searchError}
		<p class="text-sm text-red-500">{searchError}</p>
	{/if}

	{#if searchResult}
		<div class="bg-gray-50 rounded-lg p-3 flex items-center justify-between gap-3">
			<div class="flex items-center gap-3 min-w-0">
				<div
					class="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-semibold text-blue-800 flex-shrink-0"
				>
					{initials(searchResult.firstName, searchResult.lastName)}
				</div>
				<div class="min-w-0">
					<p class="text-sm font-medium text-gray-900 truncate">
						{searchResult.firstName}
						{searchResult.lastName}
					</p>
					<p class="text-xs text-gray-500 truncate">{searchResult.email}</p>
				</div>
			</div>
			{#if alreadyBlacklisted}
				<span class="text-xs text-gray-400">Already blacklisted</span>
			{:else}
				<form method="POST" action={addAction} use:enhance>
					<input type="hidden" name="candidateId" value={searchResult.candidateId} />
					<Button type="submit" size="sm" variant="destructive" class="gap-1">
						<Ban class="h-3.5 w-3.5" />
						Blacklist
					</Button>
				</form>
			{/if}
		</div>
	{/if}

	<!-- Current blacklist -->
	{#if blacklistedCandidates.length === 0}
		<div class="text-center py-8">
			<UserX class="h-10 w-10 mx-auto text-gray-300 mb-2" />
			<p class="text-sm text-gray-500">No blacklisted candidates</p>
		</div>
	{:else}
		<div class="space-y-2">
			{#each blacklistedCandidates as candidate (candidate.candidateId)}
				<div class="bg-gray-50 rounded-lg p-3 flex items-center justify-between gap-3">
					<div class="flex items-center gap-3 min-w-0">
						<div
							class="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center text-xs font-semibold text-red-800 flex-shrink-0"
						>
							{initials(candidate.firstName, candidate.lastName)}
						</div>
						<div class="min-w-0">
							<p class="text-sm font-medium text-gray-900 truncate">
								{candidate.firstName}
								{candidate.lastName}
							</p>
							<p class="text-xs text-gray-500 truncate">
								{candidate.email} · since {format(new Date(candidate.createdAt), 'PP')}
							</p>
						</div>
					</div>
					<form method="POST" action={removeAction} use:enhance>
						<input type="hidden" name="candidateId" value={candidate.candidateId} />
						<button
							type="submit"
							class="text-gray-400 hover:text-red-500 transition-colors"
							title="Remove from blacklist"
						>
							<Trash2 class="h-4 w-4" />
						</button>
					</form>
				</div>
			{/each}
		</div>
	{/if}
</div>
