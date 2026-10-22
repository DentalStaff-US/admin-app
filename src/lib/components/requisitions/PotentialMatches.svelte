<!--
  Admin-only sourcing pool for a permanent requisition: professionals open to
  permanent work near the req, with three actions per card —
    Message   → plain direct message (reuses the inbox's startConversation, which
                 reopens an existing thread with that person)
    Profile   → full professional profile
    Recommend → puts them forward to the client as an application, after the admin
                 confirms the professional agreed (server re-checks everything)
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Avatar, AvatarFallback, AvatarImage } from '$lib/components/ui/avatar';
	import * as Dialog from '$lib/components/ui/dialog';
	import { MapPin, MessageSquare, Sparkles, UserRound, Users } from 'lucide-svelte';
	import type { PotentialMatch } from '$lib/server/requisitions/matches';

	export let matches: PotentialMatch[] = [];
	export let requisitionOpen = true;

	const NOTE_MAX = 2000;

	let dialogOpen = false;
	let selected: PotentialMatch | null = null;
	let note = '';
	let consent = false;
	let submitting = false;

	function openRecommend(m: PotentialMatch) {
		selected = m;
		note = '';
		consent = false;
		dialogOpen = true;
	}

	function initials(m: PotentialMatch) {
		return `${m.firstName?.[0] ?? ''}${m.lastName?.[0] ?? ''}` || '?';
	}

	function applicationLabel(m: PotentialMatch): string | null {
		const a = m.application;
		if (!a) return null;
		if (a.status === 'APPROVED') return 'Hired';
		if (a.status === 'DENIED') return 'Denied';
		return a.source === 'ADMIN_RECOMMENDED' ? 'Recommended' : 'Applied';
	}

	$: belowCount = matches.filter((m) => !m.meetsExperience).length;
	$: missingSkillsCount = matches.filter((m) => !m.meetsSkillRequirements).length;
</script>

{#if matches.length === 0}
	<div class="text-center py-10">
		<Users class="h-10 w-10 mx-auto text-gray-300 mb-2" />
		<p class="text-sm text-gray-600">
			No professionals open to permanent work match this discipline within the search radius.
		</p>
	</div>
{:else}
	<p class="text-xs text-gray-500 mb-3">
		{matches.length} professional{matches.length === 1 ? '' : 's'} open to permanent work, nearest
		first{belowCount ? ` · ${belowCount} below the required experience level (listed last)` : ''}{missingSkillsCount
			? ` · ${missingSkillsCount} missing required skills (listed last)`
			: ''}.
		Pay range isn't filtered for permanent roles.
	</p>
	<div class="space-y-3">
		{#each matches as m (m.candidateId)}
			{@const appLabel = applicationLabel(m)}
			<div class="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border bg-white p-4">
				<div class="flex items-center gap-3 flex-1 min-w-0">
					<Avatar class="h-12 w-12">
						<AvatarImage src={m.avatarUrl} alt={`${m.firstName} ${m.lastName}`} />
						<AvatarFallback>{initials(m)}</AvatarFallback>
					</Avatar>
					<div class="min-w-0">
						<p class="font-medium text-gray-900 truncate">{m.firstName} {m.lastName}</p>
						<div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 mt-0.5">
							<span class="inline-flex items-center gap-1">
								<MapPin class="h-3 w-3" />{m.distance} mi away{m.city ? ` · ${m.city}` : ''}
							</span>
							<span>{m.disciplineAbbr ?? m.disciplineName}</span>
							{#if m.experienceLevelId}
								<span>Level {m.experienceLevelOrder}</span>
							{/if}
							<span>{m.workPreference === 'PERMANENT' ? 'Permanent only' : 'Temp or permanent'}</span>
						</div>
						<div class="flex flex-wrap gap-1.5 mt-1.5">
							{#if !m.meetsExperience}
								<span class="text-[11px] rounded-full px-2 py-0.5 bg-amber-100 text-amber-800">
									Below required experience
								</span>
							{/if}
							{#if !m.meetsSkillRequirements}
								<span class="text-[11px] rounded-full px-2 py-0.5 bg-amber-100 text-amber-800">
									Missing required skills
								</span>
							{/if}
							{#if appLabel}
								<span class="text-[11px] rounded-full px-2 py-0.5 bg-blue-100 text-blue-800">
									{appLabel}
								</span>
							{/if}
						</div>
					</div>
				</div>
				<div class="flex flex-wrap gap-2 sm:justify-end">
					<form method="POST" action="/inbox?/startConversation">
						<input type="hidden" name="userIDs" value={JSON.stringify([m.userId])} />
						<Button type="submit" variant="outline" size="sm" class="gap-1">
							<MessageSquare class="h-4 w-4" /> Message
						</Button>
					</form>
					<Button variant="outline" size="sm" class="gap-1" href={`/professionals/${m.candidateId}`}>
						<UserRound class="h-4 w-4" /> Profile
					</Button>
					<Button
						size="sm"
						class="gap-1"
						disabled={!!m.application || !requisitionOpen}
						title={m.application
							? 'Already has an application on this requisition'
							: !requisitionOpen
								? 'Requisition is not open'
								: 'Put this professional forward to the client'}
						on:click={() => openRecommend(m)}
					>
						<Sparkles class="h-4 w-4" /> Recommend
					</Button>
				</div>
			</div>
		{/each}
	</div>
{/if}

<Dialog.Root bind:open={dialogOpen}>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>
				Recommend {selected?.firstName}
				{selected?.lastName}
			</Dialog.Title>
			<Dialog.Description>
				They'll appear in the client's Applications as "Recommended by our team". The client and the
				professional are both emailed; the professional isn't told which practice it is.
			</Dialog.Description>
		</Dialog.Header>
		{#if selected}
			<form
				method="POST"
				action="?/recommendCandidate"
				use:enhance={() => {
					submitting = true;
					return async ({ result, update }) => {
						submitting = false;
						if (result.type === 'success') dialogOpen = false;
						await update();
					};
				}}
				class="space-y-4"
			>
				<input type="hidden" name="candidateId" value={selected.candidateId} />
				{#if !selected.meetsExperience}
					<p class="text-sm rounded-md bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2">
						This professional is below the requisition's required experience level.
					</p>
				{/if}
				{#if !selected.meetsSkillRequirements}
					<p class="text-sm rounded-md bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2">
						This professional does not have every skill the requisition requires.
					</p>
				{/if}
				<div>
					<label for="recommend-note" class="text-sm font-medium text-gray-900">
						Note to the client <span class="font-normal text-gray-500">(optional, shown to them)</span>
					</label>
					<Textarea
						id="recommend-note"
						name="note"
						bind:value={note}
						maxlength={NOTE_MAX}
						placeholder="Why they're a good fit — availability, skills, what you learned vetting them…"
						class="mt-1 min-h-[100px] text-sm"
					/>
				</div>
				<label class="flex items-start gap-2 text-sm text-gray-800 cursor-pointer">
					<input
						type="checkbox"
						name="consent"
						value="true"
						bind:checked={consent}
						class="mt-0.5 rounded border-gray-300"
					/>
					<span>The professional agreed to be put forward for this role.</span>
				</label>
				<Dialog.Footer>
					<Button type="button" variant="outline" on:click={() => (dialogOpen = false)}>Cancel</Button>
					<Button type="submit" disabled={!consent || submitting}>
						{submitting ? 'Recommending…' : 'Recommend to client'}
					</Button>
				</Dialog.Footer>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>
