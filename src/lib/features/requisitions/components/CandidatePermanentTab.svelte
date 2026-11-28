<script lang="ts">
	import { Briefcase } from 'lucide-svelte';
	import { format } from 'date-fns';
	import EmptyState from '$dtss/EmptyState.svelte';
	import Section from '$dtss/Section.svelte';
	import StatusBadge from '$dtss/StatusBadge.svelte';
	import { splitCandidateActivity, type CandidatePermanentItem } from '../candidatePermanent';
	import { STAGE_LABEL, type ApplicantStage } from '../permanentLifecycle';

	/**
	 * The professional detail "Permanent" tab (06 › Permanent hiring): what is
	 * this person in the running for? Admin-only: it names practices.
	 * Data: getCandidatePermanentActivity(candidateId) from
	 * $features/requisitions/server/permanent.
	 */
	let { items, firstName = null }: { items: CandidatePermanentItem[]; firstName?: string | null } = $props();

	const groups = $derived.by(() => {
		const { active, rest } = splitCandidateActivity(items);
		return [
			{ key: 'active', title: 'In the running', items: active },
			{ key: 'rest', title: 'Earlier', items: rest }
		].filter((g) => g.items.length);
	});

	// Stage → a status word with the right tone (StatusBadge owns the colours).
	const TONE: Record<ApplicantStage, string> = {
		INTERESTED: 'OPEN',
		APPLIED: 'PENDING',
		RECOMMENDED: 'PENDING',
		HIRED: 'APPROVED',
		DENIED: 'DENIED'
	};
	const href = (i: CandidatePermanentItem) =>
		i.applicationId ? `/requisitions/${i.requisitionId}/application/${i.applicationId}` : `/requisitions/${i.requisitionId}?tab=applicants&stage=interested`;
	const when = (d: Date | string) => format(new Date(d), 'MMM d, yyyy');
</script>

<Section
	title="Permanent"
	description={`Permanent requisitions ${firstName ?? 'this professional'} saved or is applying for, with where they stand on each.`}
	flush
>
	{#if items.length === 0}
		<div class="p-5 sm:p-6">
			<EmptyState icon={Briefcase} title="No permanent activity" description="Saved and applied permanent requisitions show up here." />
		</div>
	{:else}
		<div class="divide-y">
			{#each groups as group (group.key)}
				<section class="px-5 py-4 sm:px-6" aria-labelledby={`perm-${group.key}`}>
					<h3 id={`perm-${group.key}`} class="text-overline uppercase text-muted-foreground">
						{group.title} <span class="tabular-nums">{group.items.length}</span>
					</h3>
					<ul class="mt-2 divide-y">
						{#each group.items as item (item.requisitionId)}
							<li class="relative flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
								<div class="min-w-0">
									<a href={href(item)} class="font-semibold after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring">
										{item.title || item.disciplineName}
									</a>
									<p class="text-sm text-muted-foreground">
										#{item.requisitionId} · {item.companyName} · {item.locationName}
									</p>
								</div>
								<div class="flex flex-wrap items-center gap-2 text-sm">
									<StatusBadge status={TONE[item.stage]} label={STAGE_LABEL[item.stage]} />
									{#if item.requestStatus !== 'OPEN'}
										<StatusBadge status={item.requestStatus} label={`Requisition ${item.requestStatus.replace(/_/g, ' ').toLowerCase()}`} />
									{/if}
									<span class="text-muted-foreground">
										{item.stage === 'INTERESTED' ? 'Saved' : item.stage === 'RECOMMENDED' ? 'Recommended' : 'Applied'} {when(item.at)}
									</span>
								</div>
							</li>
						{/each}
					</ul>
				</section>
			{/each}
		</div>
	{/if}
</Section>
