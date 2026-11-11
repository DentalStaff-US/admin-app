<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { Bookmark, Check, Sparkles, UserRound, Users, X } from 'lucide-svelte';
	import { format } from 'date-fns';
	import ConfirmDialog from '$dtss/ConfirmDialog.svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import Section from '$dtss/Section.svelte';
	import StatusBadge from '$dtss/StatusBadge.svelte';
	import { Button } from '$lib/components/ui/button';
	import {
		groupApplicants,
		interestedView,
		parseStageParam,
		STAGE_LABEL,
		stageActions,
		type ApplicantStage,
		type Audience
	} from '../permanentLifecycle';
	import RecommendDialog, { type RecommendTarget } from './RecommendDialog.svelte';

	type Applicant = {
		application: {
			id: string;
			status: string | null;
			source: string;
			createdAt: Date | string;
			archived?: boolean | null;
			recommendationNote?: string | null;
		};
		user: { firstName?: string | null; lastName?: string | null; avatarUrl?: string | null };
		candidateProfile: { id: string };
		discipline?: { name?: string | null; abbreviation?: string | null } | null;
		experienceLevel?: { value?: string | null } | null;
	};
	type Interested = {
		candidateId: string;
		userId: string;
		firstName: string | null;
		lastName: string | null;
		avatarUrl: string | null;
		savedAt: Date | string;
	};

	let {
		requisitionId,
		requestStatus,
		applications,
		interested = [],
		interestedCount,
		audience,
		canManage,
		stage = null
	}: {
		requisitionId: number;
		requestStatus: string;
		applications: Applicant[];
		/** Names: admins only. The server never sends these to practices. */
		interested?: Interested[];
		interestedCount: number;
		audience: Audience;
		canManage: boolean;
		/** `?stage=` from a count link: show exactly that set. */
		stage?: string | null;
	} = $props();

	const only = $derived(parseStageParam(stage));
	const live = $derived(
		applications
			.filter((a) => !a.application.archived)
			.map((a) => ({ ...a, status: a.application.status, source: a.application.source }))
	);
	const groups = $derived(groupApplicants(live, only));
	const showInterested = $derived(!only || only.includes('INTERESTED'));
	const view = $derived(interestedView(audience, interested, interestedCount));

	const name = (u: { firstName?: string | null; lastName?: string | null }) =>
		`${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || 'Professional';
	const initials = (u: { firstName?: string | null; lastName?: string | null }) =>
		`${u.firstName?.[0] ?? ''}${u.lastName?.[0] ?? ''}` || '?';
	const appHref = (a: Applicant) => `/requisitions/${requisitionId}/application/${a.application.id}`;

	const STAGE_TONE: Record<ApplicantStage, string> = {
		RECOMMENDED: 'PENDING',
		APPLIED: 'PENDING',
		HIRED: 'APPROVED',
		DENIED: 'DENIED',
		INTERESTED: 'OPEN'
	};

	// Stage actions. Approve and Deny are consequential (they notify people and,
	// for approve, move money), so both confirm first.
	let target = $state<Applicant | null>(null);
	let approveOpen = $state(false);
	let denyOpen = $state(false);
	let recommendOpen = $state(false);
	let recommendTarget = $state<RecommendTarget | null>(null);
	let submitting = $state(false);

	// The application actions redirect to the application page; stay here instead.
	const stayHere = () => {
		submitting = true;
		return async ({ result, update }: { result: { type: string }; update: () => Promise<void> }) => {
			submitting = false;
			approveOpen = denyOpen = false;
			if (result.type === 'redirect') await invalidateAll();
			else await update();
		};
	};
	const actionUrl = (a: Applicant | null, action: string) =>
		a ? `/requisitions/${requisitionId}/application/${a.application.id}?/${action}` : '';
	const targetName = $derived(target ? name(target.user) : '');
	const total = $derived(live.length);
</script>

{#snippet avatar(u: { firstName?: string | null; lastName?: string | null; avatarUrl?: string | null })}
	{#if u.avatarUrl}
		<img src={u.avatarUrl} alt="" class="size-10 shrink-0 rounded-full object-cover" />
	{:else}
		<span class="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-pro to-pro-dark text-sm font-bold text-white">{initials(u)}</span>
	{/if}
{/snippet}

<Section
	title="Applicants"
	description={audience === 'admin'
		? 'Recommendations first, then applications, hires and declines.'
		: 'Professionals our team recommended, then everyone who applied.'}
	flush
>
	{#snippet actions()}
		{#if only}
			<Button variant="outline" size="sm" href={`/requisitions/${requisitionId}?tab=applicants`}>Show everyone</Button>
		{/if}
	{/snippet}

	{#if total === 0 && (!showInterested || view.count === 0)}
		<div class="p-5 sm:p-6">
			<EmptyState
				icon={Users}
				title="No applicants yet"
				description={audience === 'admin'
					? 'Applications and recommendations show up here. Use Matches to find professionals open to permanent work.'
					: 'Applications show up here as professionals apply. We may also recommend people we have vetted.'}
			/>
		</div>
	{:else}
		<div class="divide-y">
			{#each groups as group (group.stage)}
				<section aria-labelledby={`stage-${group.stage}`} class="px-5 py-4 sm:px-6">
					<h3 id={`stage-${group.stage}`} class="flex items-center gap-2 text-overline uppercase text-muted-foreground">
						{STAGE_LABEL[group.stage]} <span class="tabular-nums">{group.items.length}</span>
					</h3>
					<ul class="mt-2 divide-y">
						{#each group.items as a (a.application.id)}
							{@const acts = stageActions({ stage: group.stage, audience, canManage, requestStatus })}
							<li class="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
								<div class="flex min-w-0 flex-1 items-center gap-3">
									{@render avatar(a.user)}
									<div class="min-w-0">
										<p class="flex flex-wrap items-center gap-2">
											<a href={appHref(a)} class="font-semibold hover:underline">{name(a.user)}</a>
											{#if group.stage === 'RECOMMENDED'}
												<span class="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary-dark">
													<Sparkles class="size-3" aria-hidden="true" /> Recommended by our team
												</span>
											{:else}
												<StatusBadge status={STAGE_TONE[group.stage]} label={STAGE_LABEL[group.stage]} />
											{/if}
										</p>
										<p class="text-sm text-muted-foreground">
											{[`${group.stage === 'RECOMMENDED' ? 'Recommended' : 'Applied'} ${format(new Date(a.application.createdAt), 'MMM d, yyyy')}`, a.experienceLevel?.value].filter(Boolean).join(' · ')}
										</p>
										{#if a.application.recommendationNote}
											<p class="mt-1 line-clamp-2 text-sm">“{a.application.recommendationNote}”</p>
										{/if}
									</div>
								</div>
								<div class="flex flex-wrap gap-2 sm:justify-end">
									{#if audience === 'admin'}
										<Button variant="ghost" size="sm" href={`/professionals/${a.candidateProfile.id}`} class="gap-1">
											<UserRound class="size-4" aria-hidden="true" /> Profile
										</Button>
									{/if}
									{#if acts.includes('DENY')}
										<Button variant="destructiveOutline" size="sm" class="gap-1" on:click={() => { target = a; denyOpen = true; }}>
											<X class="size-4" aria-hidden="true" /> Deny…
										</Button>
									{/if}
									{#if acts.includes('APPROVE')}
										<Button variant="outline" size="sm" class="gap-1" on:click={() => { target = a; approveOpen = true; }}>
											<Check class="size-4" aria-hidden="true" /> Approve…
										</Button>
									{/if}
									{#if acts.length === 0}
										<Button variant="outline" size="sm" href={appHref(a)}>View</Button>
									{/if}
								</div>
							</li>
						{/each}
					</ul>
				</section>
			{/each}

			{#if showInterested}
				<section aria-labelledby="stage-INTERESTED" class="px-5 py-4 sm:px-6">
					<h3 id="stage-INTERESTED" class="flex items-center gap-2 text-overline uppercase text-muted-foreground">
						Interested <span class="tabular-nums">{view.count}</span>
					</h3>
					{#if audience !== 'admin'}
						<!-- Count only: saving a job isn't consent to be contacted. -->
						<p class="mt-2 flex items-start gap-2 text-sm text-muted-foreground">
							<Bookmark class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
							{#if view.count === 0}
								No one has saved this request yet.
							{:else}
								{view.count} professional{view.count === 1 ? ' has' : 's have'} saved this request but not applied. Saving isn't consent
								to be contacted, so we don't share who; our team may recommend them to you.
							{/if}
						</p>
					{:else if view.people.length === 0}
						<p class="mt-2 text-sm text-muted-foreground">No one has saved this request without applying.</p>
					{:else}
						<ul class="mt-2 divide-y">
							{#each view.people as p (p.candidateId)}
								{@const acts = stageActions({ stage: 'INTERESTED', audience, canManage, requestStatus })}
								<li class="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
									<div class="flex min-w-0 flex-1 items-center gap-3">
										{@render avatar(p)}
										<div class="min-w-0">
											<a href={`/professionals/${p.candidateId}`} class="font-semibold hover:underline">{name(p)}</a>
											<p class="text-sm text-muted-foreground">Saved {format(new Date(p.savedAt), 'MMM d, yyyy')}</p>
										</div>
									</div>
									<div class="flex flex-wrap gap-2 sm:justify-end">
										<form method="POST" action="/inbox?/startConversation">
											<input type="hidden" name="userIDs" value={JSON.stringify([p.userId])} />
											<Button type="submit" variant="outline" size="sm">Message</Button>
										</form>
										{#if acts.includes('RECOMMEND')}
											<Button
												variant="outline"
												size="sm"
												class="gap-1"
												on:click={() => {
													recommendTarget = { candidateId: p.candidateId, firstName: p.firstName, lastName: p.lastName };
													recommendOpen = true;
												}}
											>
												<Sparkles class="size-4" aria-hidden="true" /> Recommend…
											</Button>
										{/if}
									</div>
								</li>
							{/each}
						</ul>
					{/if}
				</section>
			{/if}
		</div>
	{/if}
</Section>

<ConfirmDialog
	bind:open={approveOpen}
	title={`Hire ${targetName}?`}
	description={audience === 'admin'
		? `${targetName} is approved for this position and notified. Other pending applicants are declined and notified, and the request moves to payment required for the placement fee.`
		: `${targetName} is approved and notified. Other pending applicants are declined, and we'll invoice the placement fee.`}
>
	{#snippet confirm()}
		<form method="POST" action={actionUrl(target, 'approveApplication')} use:enhance={stayHere}>
			<Button type="submit" class="w-full sm:w-auto" disabled={submitting}>{submitting ? 'Approving…' : `Approve ${targetName}`}</Button>
		</form>
	{/snippet}
</ConfirmDialog>

<ConfirmDialog
	bind:open={denyOpen}
	title={`Decline ${targetName}?`}
	description={`${targetName} is told the position went another way. You can't undo this from here.`}
	cancelLabel="Keep application"
>
	{#snippet confirm()}
		<form method="POST" action={actionUrl(target, 'denyApplication')} use:enhance={stayHere}>
			<Button type="submit" variant="destructive" class="w-full sm:w-auto" disabled={submitting}>{submitting ? 'Declining…' : 'Deny application'}</Button>
		</form>
	{/snippet}
</ConfirmDialog>

{#if audience === 'admin'}
	<RecommendDialog bind:open={recommendOpen} target={recommendTarget} />
{/if}
