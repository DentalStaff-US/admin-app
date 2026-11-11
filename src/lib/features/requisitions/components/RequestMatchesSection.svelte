<!--
  Admin-only sourcing pool for a permanent request: professionals open to
  permanent work nearby, with three actions each —
    Message   → a direct message (the inbox reopens an existing thread)
    Profile   → the full professional profile
    Recommend → puts them forward to the practice as an application, after the
                admin confirms the professional agreed (the server re-checks)
-->
<script lang="ts">
	import { MapPin, MessageSquare, Sparkles, UserRound, Users } from 'lucide-svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import Hint from '$dtss/Hint.svelte';
	import Section from '$dtss/Section.svelte';
	import StatusBadge from '$dtss/StatusBadge.svelte';
	import { Button } from '$lib/components/ui/button';
	import type { PotentialMatch } from '$lib/server/requisitions/matches';
	import RecommendDialog, { type RecommendTarget } from './RecommendDialog.svelte';

	let { matches = [], requisitionOpen = true }: { matches: PotentialMatch[]; requisitionOpen: boolean } = $props();

	let dialogOpen = $state(false);
	let target = $state<RecommendTarget | null>(null);

	function openRecommend(m: PotentialMatch) {
		target = {
			candidateId: m.candidateId,
			firstName: m.firstName,
			lastName: m.lastName,
			belowExperience: !m.meetsExperience,
			missingSkills: !m.meetsSkillRequirements
		};
		dialogOpen = true;
	}

	const initials = (m: PotentialMatch) => `${m.firstName?.[0] ?? ''}${m.lastName?.[0] ?? ''}` || '?';

	/** Their application on this request, as a status the badge understands. */
	function application(m: PotentialMatch): { status: string; label: string } | null {
		const a = m.application;
		if (!a) return null;
		if (a.status === 'APPROVED') return { status: 'APPROVED', label: 'Hired' };
		if (a.status === 'DENIED') return { status: 'DENIED', label: 'Denied' };
		return { status: 'OPEN', label: a.source === 'ADMIN_RECOMMENDED' ? 'Recommended' : 'Applied' };
	}

	const blockedReason = (m: PotentialMatch) =>
		m.application
			? 'Already has an application on this request.'
			: !requisitionOpen
				? 'Only open requests can take recommendations.'
				: null;

	const belowCount = $derived(matches.filter((m) => !m.meetsExperience).length);
	const missingSkillsCount = $derived(matches.filter((m) => !m.meetsSkillRequirements).length);
</script>

<Section
	title="Potential matches"
	description="Professionals open to permanent work near this location. Message them to vet availability and skills, then recommend the right ones. Only admins see this."
>
	{#if matches.length === 0}
		<EmptyState
			icon={Users}
			title="No matches nearby"
			description="No professionals open to permanent work match this discipline within the search radius."
		/>
	{:else}
		<p class="text-sm text-muted-foreground">
			{matches.length} professional{matches.length === 1 ? '' : 's'} open to permanent work, nearest first{belowCount
				? ` · ${belowCount} below the required experience level (listed last)`
				: ''}{missingSkillsCount ? ` · ${missingSkillsCount} missing required skills (listed last)` : ''}. Pay
			range isn't filtered for permanent roles.
		</p>
		<ul class="mt-3 divide-y">
			{#each matches as m (m.candidateId)}
				{@const app = application(m)}
				{@const blocked = blockedReason(m)}
				<li class="flex flex-col gap-3 py-4 first:pt-1 last:pb-1 sm:flex-row sm:items-center">
					<div class="flex min-w-0 flex-1 items-center gap-3">
						{#if m.avatarUrl}
							<img src={m.avatarUrl} alt="" class="size-10 shrink-0 rounded-full object-cover" />
						{:else}
							<span class="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-pro to-pro-dark text-sm font-bold text-white">{initials(m)}</span>
						{/if}
						<div class="min-w-0">
							<p class="truncate font-semibold">{m.firstName} {m.lastName}</p>
							<p class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
								<span class="inline-flex items-center gap-1">
									<MapPin class="size-3.5" aria-hidden="true" />{m.distance} mi away{m.city ? ` · ${m.city}` : ''}
								</span>
								<span>{m.disciplineAbbr ?? m.disciplineName}</span>
								{#if m.experienceLevelId}<span>Level {m.experienceLevelOrder}</span>{/if}
								<span>{m.workPreference === 'PERMANENT' ? 'Permanent only' : 'Temp or permanent'}</span>
							</p>
							{#if !m.meetsExperience || !m.meetsSkillRequirements || app}
								<div class="mt-1.5 flex flex-wrap gap-1.5">
									{#if !m.meetsExperience}<StatusBadge status="UNFULFILLED" label="Below required experience" />{/if}
									{#if !m.meetsSkillRequirements}<StatusBadge status="UNFULFILLED" label="Missing required skills" />{/if}
									{#if app}<StatusBadge status={app.status} label={app.label} />{/if}
								</div>
							{/if}
						</div>
					</div>
					<div class="flex flex-wrap gap-2 sm:justify-end">
						<form method="POST" action="/inbox?/startConversation">
							<input type="hidden" name="userIDs" value={JSON.stringify([m.userId])} />
							<Button type="submit" variant="outline" size="sm" class="gap-1">
								<MessageSquare class="size-4" aria-hidden="true" /> Message
							</Button>
						</form>
						<Button variant="outline" size="sm" class="gap-1" href={`/professionals/${m.candidateId}`}>
							<UserRound class="size-4" aria-hidden="true" /> Profile
						</Button>
						{#if blocked}
							<!-- Disabled buttons don't fire pointer events: the hint sits on a wrapper. -->
							<Hint text={blocked}>
								<Button size="sm" class="gap-1" disabled>
									<Sparkles class="size-4" aria-hidden="true" /> Recommend
								</Button>
							</Hint>
						{:else}
							<Button size="sm" class="gap-1" on:click={() => openRecommend(m)}>
								<Sparkles class="size-4" aria-hidden="true" /> Recommend…
							</Button>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</Section>

<RecommendDialog bind:open={dialogOpen} {target} />
