<!--
  Assign or reassign a professional to one workday (admin). Lists the qualified
  professionals near the request, plus a name search that deliberately bypasses
  the qualification gates.

  Warn, never hide: a lapsed credential or a day the professional marked
  unavailable doesn't remove them from the list. Assigning one of them goes
  through a ConfirmDialog that names both facts, and an availability override
  posts `acknowledgeUnavailable=true` (the server refuses it otherwise).

  Legacy syntax on purpose: ProfessionalSearch hands each row out through
  `let:professional` slots.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { MapPin } from 'lucide-svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Avatar from '$lib/components/ui/avatar';
	import { Button } from '$lib/components/ui/button';
	import ConfirmDialog from '$dtss/ConfirmDialog.svelte';
	import ProfessionalSearch from '$lib/components/professionals/ProfessionalSearch.svelte';
	import { TONE_CLASSES, type StatusTone } from '$tokens/status';
	import { cn } from '$lib/utils';

	type Professional = {
		candidateId: string;
		firstName?: string | null;
		lastName?: string | null;
		email?: string | null;
		avatarUrl?: string | null;
		distance?: number | string | null;
		disciplineAbbr?: string | null;
		[key: string]: unknown;
	};

	export let open = false;
	export let mode: 'assign' | 'reassign' = 'assign';
	/** The default (qualified) list from the page load. */
	export let professionals: Professional[] = [];
	export let requisitionId: number | string | undefined;
	export let recurrenceDayId: string | undefined;
	/** The request's discipline: only a lapsed credential for it is a warning. */
	export let requiredDisciplineId: string | null | undefined = null;
	export let shiftDates: string[] = [];
	export let shiftWeekdayName = 'that day';
	export let radiusMiles = 60;
	/** Reassign only: who is on the shift now (left out of the list). */
	export let current: { id?: string | null; firstName?: string | null; lastName?: string | null } | null =
		null;

	let search: ProfessionalSearch;
	let searching = false;
	$: if (!open) search?.reset();

	// "Show more" relaxes the experience, pay-range and skills gates. The relaxed
	// set is a superset of the default one, so only the new rows are appended.
	let extended: Professional[] = [];
	let loadingExtended = false;
	let extendedLoaded = false;
	let extendedError: string | null = null;

	async function loadMore() {
		if (loadingExtended || extendedLoaded) return;
		loadingExtended = true;
		extendedError = null;
		try {
			const res = await fetch(
				`/api/requisitions/${requisitionId}/qualified-candidates?includeAllExperience=true&includeOutsidePayRange=true&includeMissingSkills=true`
			);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const all: Professional[] = await res.json();
			const existing = new Set(professionals.map((p) => p.candidateId));
			extended = all.filter((p) => !existing.has(p.candidateId));
			extendedLoaded = true;
		} catch (err) {
			extendedError = err instanceof Error ? err.message : 'Failed to load';
		} finally {
			loadingExtended = false;
		}
	}

	$: all = [...professionals, ...extended];
	$: visible = mode === 'reassign' ? all.filter((p) => p.candidateId !== current?.id) : all;
	$: verb = mode === 'assign' ? 'Assign' : 'Reassign';
	$: action = mode === 'assign' ? '?/assignCandidate' : '?/reassignRecurrenceDay';

	const name = (p: { firstName?: string | null; lastName?: string | null } | null) => `${p?.firstName ?? ''} ${p?.lastName ?? ''}`.trim();

	/** Only name-search rows carry `disciplines`; the gated list can't hold a lapsed credential. */
	function certBlockedFor(p: Professional): boolean {
		const list = p.disciplines;
		if (!Array.isArray(list)) return false;
		return (list as Array<{ id?: string; certBlocked?: boolean }>).some(
			(d) => d?.certBlocked && (!requiredDisciplineId || d.id === requiredDisciplineId)
		);
	}

	function unavailableFor(p: Professional): false | 'WEEKDAY' | 'DATE' {
		const blocked = p.unavailableDates as Array<{ reason?: string }> | undefined;
		if (!Array.isArray(blocked) || blocked.length === 0) return false;
		return blocked.some((b) => b?.reason === 'weekday') ? 'WEEKDAY' : 'DATE';
	}

	function flagsFor(p: Professional): { label: string; tone: StatusTone }[] {
		const flags: { label: string; tone: StatusTone }[] = [];
		if (certBlockedFor(p)) flags.push({ label: 'Cert expired', tone: 'negative' });
		const unavailable = unavailableFor(p);
		if (unavailable)
			flags.push({
				label: unavailable === 'WEEKDAY' ? `Doesn't work ${shiftWeekdayName}s` : 'Unavailable this day',
				tone: 'warning'
			});
		if (p.meetsSkillRequirements === false) flags.push({ label: 'Missing required skills', tone: 'warning' });
		if (p.wantsThisWorkType === false) flags.push({ label: 'Wants permanent work only', tone: 'neutral' });
		return flags;
	}

	/** The facts staff must knowingly accept before placing this person. */
	function warningsFor(p: Professional): string[] {
		const warnings: string[] = [];
		if (certBlockedFor(p)) warnings.push('Their certification for this discipline has expired.');
		const unavailable = unavailableFor(p);
		if (unavailable)
			warnings.push(
				unavailable === 'WEEKDAY'
					? `They don't work ${shiftWeekdayName}s.`
					: 'They marked this day as one they cannot work.'
			);
		return warnings;
	}

	let pending: Professional | null = null;
	let confirmOpen = false;
	let submittingId: string | null = null;

	function ask(p: Professional) {
		pending = p;
		confirmOpen = true;
	}

	const submit =
		(candidateId: string): SubmitFunction =>
		() => {
			submittingId = candidateId;
			return async ({ result, update }) => {
				submittingId = null;
				if (result.type === 'success') {
					confirmOpen = false;
					open = false;
				}
				await update();
			};
		};
</script>

{#snippet badges(p: Professional)}
	{#each flagsFor(p) as flag (flag.label)}
		<span class={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-bold', TONE_CLASSES[flag.tone])}>
			{flag.label}
		</span>
	{/each}
{/snippet}

{#snippet rowAction(p: Professional)}
	{#if warningsFor(p).length > 0}
		<Button size="sm" class="w-full sm:w-auto" on:click={() => ask(p)}>{verb}</Button>
	{:else}
		<form method="POST" {action} use:enhance={submit(p.candidateId)}>
			<input type="hidden" name="candidateId" value={p.candidateId} />
			<input type="hidden" name="recurrenceDayId" value={recurrenceDayId} />
			<Button type="submit" size="sm" class="w-full sm:w-auto" disabled={submittingId === p.candidateId}>
				{submittingId === p.candidateId ? `${verb}ing…` : verb}
			</Button>
		</form>
	{/if}
{/snippet}

<Dialog.Root bind:open>
	<Dialog.Content class="max-h-[85vh] max-w-2xl overflow-y-auto">
		<Dialog.Header>
			<Dialog.Title class="text-h2">
				{mode === 'assign' ? 'Assign a professional' : `Replace ${name(current)}`}
			</Dialog.Title>
			<Dialog.Description>
				{visible.length} qualified professional{visible.length === 1 ? '' : 's'} within {radiusMiles} miles{extendedLoaded
					? ', including every experience level and pay range'
					: ''}. The professional is notified by email and SMS.
			</Dialog.Description>
		</Dialog.Header>

		<ProfessionalSearch
			bind:this={search}
			bind:searching
			{requisitionId}
			excludeCandidateId={mode === 'reassign' ? (current?.id ?? null) : null}
			dates={shiftDates}
			let:professional
		>
			<svelte:fragment slot="badges" let:professional>{@render badges(professional)}</svelte:fragment>
			{@render rowAction(professional)}
		</ProfessionalSearch>

		<ul class="divide-y rounded-lg border" class:hidden={searching}>
			{#each visible as p (p.candidateId)}
				<li class="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
					<div class="flex min-w-0 gap-3">
						<Avatar.Root class="size-10">
							{#if p.avatarUrl}<Avatar.Image src={p.avatarUrl} alt="" />{/if}
							<Avatar.Fallback class="bg-gradient-to-br from-pro to-primary text-xs font-bold text-white">
								{p.firstName?.[0] ?? ''}{p.lastName?.[0] ?? ''}
							</Avatar.Fallback>
						</Avatar.Root>
						<div class="min-w-0">
							<p class="font-semibold">{name(p)}</p>
							{#if p.email}<p class="truncate text-sm text-muted-foreground">{p.email}</p>{/if}
							<div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
								<span class="inline-flex items-center gap-1">
									<MapPin class="size-3.5" aria-hidden="true" />{p.distance} mi away
								</span>
								{#if p.disciplineAbbr}
									<span class="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground">{p.disciplineAbbr}</span>
								{/if}
							</div>
							<div class="mt-2 flex flex-wrap gap-1.5">{@render badges(p)}</div>
						</div>
					</div>
					{@render rowAction(p)}
				</li>
			{:else}
				<li class="px-4 py-8 text-center text-sm text-muted-foreground">
					No {mode === 'reassign' ? 'other ' : ''}qualified professionals within {radiusMiles} miles.
				</li>
			{/each}
		</ul>

		{#if extendedError}
			<p class="text-center text-sm text-destructive" role="alert">Couldn't load more: {extendedError}</p>
		{/if}

		<Dialog.Footer class="gap-2 sm:items-center sm:justify-between">
			{#if !extendedLoaded && !searching}
				<Button variant="link" class="h-auto whitespace-normal p-0 text-left" disabled={loadingExtended} on:click={loadMore}>
					{loadingExtended ? 'Loading…' : 'Show more: include professionals outside the pay range or experience level'}
				</Button>
			{:else}
				<span></span>
			{/if}
			<Button variant="outline" on:click={() => (open = false)}>Close</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<ConfirmDialog
	bind:open={confirmOpen}
	title={`${verb} ${name(pending)} anyway?`}
	description={`${pending ? warningsFor(pending).join(' ') : ''} They'll be notified and can cancel the shift.`}
>
	{#snippet confirm({ ready })}
		{#if pending}
			<form method="POST" {action} use:enhance={submit(pending.candidateId)}>
				<input type="hidden" name="candidateId" value={pending.candidateId} />
				<input type="hidden" name="recurrenceDayId" value={recurrenceDayId} />
				{#if unavailableFor(pending)}
					<!-- The server refuses an unacknowledged availability override and
					     records the acknowledgement in action_history. -->
					<input type="hidden" name="acknowledgeUnavailable" value="true" />
				{/if}
				<Button type="submit" class="min-h-11 w-full sm:min-h-10 sm:w-auto" disabled={!ready || submittingId === pending.candidateId}>
					{submittingId === pending.candidateId ? `${verb}ing…` : `${verb} anyway`}
				</Button>
			</form>
		{/if}
	{/snippet}
</ConfirmDialog>
