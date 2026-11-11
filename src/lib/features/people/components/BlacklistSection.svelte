<script lang="ts">
	import { enhance } from '$app/forms';
	import { format } from 'date-fns';
	import { Ban, Search, UserX, X } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import EmptyState from '$dtss/EmptyState.svelte';
	import ConfirmAction from './ConfirmAction.svelte';
	import PersonAvatar from './PersonAvatar.svelte';
	import { displayName, initialsOf } from '../people';

	type Person = {
		candidateId: string;
		firstName: string | null;
		lastName: string | null;
		email: string;
		avatarUrl: string | null;
	};

	/**
	 * Professionals a practice must never be matched with (was
	 * candidateBlacklistCard). Adding cancels their future shifts at this
	 * practice, so both add and remove are confirmed with the consequence.
	 */
	let {
		practiceName,
		blacklistedCandidates = [],
		searchResult = null,
		searchError = null,
		searchAction,
		addAction,
		removeAction
	}: {
		practiceName: string;
		blacklistedCandidates: (Person & { createdAt: Date | string })[];
		searchResult?: Person | null;
		searchError?: string | null;
		searchAction: string;
		addAction: string;
		removeAction: string;
	} = $props();

	let email = $state('');
	let searching = $state(false);

	const alreadyBlocked = $derived(
		!!searchResult && blacklistedCandidates.some((c) => c.candidateId === searchResult?.candidateId)
	);
</script>

<div class="space-y-5">
	<form
		method="POST"
		action={searchAction}
		class="space-y-2"
		use:enhance={() => {
			searching = true;
			return async ({ update }) => {
				searching = false;
				await update();
			};
		}}
	>
		<Label for="blacklist-email">Find a professional by email</Label>
		<div class="flex gap-2">
			<Input id="blacklist-email" name="email" type="email" bind:value={email} placeholder="name@example.com" />
			<Button type="submit" variant="outline" class="gap-2" disabled={searching || !email.trim()}>
				<Search class="size-4" aria-hidden="true" />
				{searching ? 'Searching…' : 'Search'}
			</Button>
		</div>
		{#if searchError}<p class="text-sm text-destructive" role="alert">{searchError}</p>{/if}
	</form>

	{#if searchResult}
		{@const name = displayName(searchResult.firstName, searchResult.lastName, searchResult.email)}
		<div class="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 p-3">
			<div class="flex min-w-0 items-center gap-3">
				<PersonAvatar {name} src={searchResult.avatarUrl} initials={initialsOf(searchResult.firstName, searchResult.lastName)} audience="pro" />
				<div class="min-w-0">
					<p class="truncate text-sm font-semibold">{name}</p>
					<p class="truncate text-sm text-muted-foreground">{searchResult.email}</p>
				</div>
			</div>
			{#if alreadyBlocked}
				<span class="text-sm text-muted-foreground">Already blacklisted</span>
			{:else}
				<ConfirmAction
					action={addAction}
					fields={{ candidateId: searchResult.candidateId }}
					title="Blacklist {name} for {practiceName}?"
					description="{name} won't be matched with {practiceName} again, and any future shifts they hold there are cancelled."
					confirmLabel="Blacklist"
					label="Blacklist"
					icon={Ban}
					variant="destructiveOutline"
				/>
			{/if}
		</div>
	{/if}

	{#if blacklistedCandidates.length === 0}
		<EmptyState icon={UserX} title="No blacklisted professionals" description="Search by email above to stop a professional being matched with this practice." />
	{:else}
		<ul class="divide-y rounded-lg border">
			{#each blacklistedCandidates as person (person.candidateId)}
				{@const name = displayName(person.firstName, person.lastName, person.email)}
				<li class="flex items-center justify-between gap-3 p-3">
					<div class="flex min-w-0 items-center gap-3">
						<PersonAvatar {name} src={person.avatarUrl} initials={initialsOf(person.firstName, person.lastName)} audience="pro" />
						<div class="min-w-0">
							<p class="truncate text-sm font-semibold">{name}</p>
							<p class="truncate text-sm text-muted-foreground">
								{person.email} · since {format(new Date(person.createdAt), 'PP')}
							</p>
						</div>
					</div>
					<ConfirmAction
						action={removeAction}
						fields={{ candidateId: person.candidateId }}
						title="Remove {name} from the blacklist?"
						description="{name} can be matched with {practiceName} again. Cancelled shifts aren't restored."
						confirmLabel="Remove"
						tone="default"
						label="Remove {name} from blacklist"
						icon={X}
						iconOnly
						variant="ghost"
					/>
				</li>
			{/each}
		</ul>
	{/if}
</div>
