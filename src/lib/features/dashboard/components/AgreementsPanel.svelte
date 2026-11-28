<script lang="ts">
	// Client agreements that still need work (completed ones are left out):
	// not sent, sent but unsigned, and signed but waiting on DTSS's countersignature.
	import { FileSignature } from 'lucide-svelte';
	import Section from '$dtss/Section.svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import { cn } from '$lib/utils';
	import { AGREEMENT_STAGE_LABEL, AGREEMENT_STAGE_SHORT, AGREEMENT_STAGES, type AgreementStage, type AgreementStatus } from '../agreements';
	import { formatAge } from '../format';
	import { TONE_SOLID } from './tones';
	import type { StatusTone } from '$tokens/status';

	let { status, now = new Date() }: { status: AgreementStatus; now?: Date } = $props();

	const TONE: Record<AgreementStage, StatusTone> = {
		NOT_SENT: 'negative',
		AWAITING_SIGNATURE: 'pending',
		AWAITING_COUNTERSIGN: 'warning'
	};
	const LIMIT = 6;

	let stage = $state<AgreementStage | 'all'>('all');
	let expanded = $state(false);
	const rows = $derived(status.rows.filter((r) => stage === 'all' || r.stage === stage));
	const shown = $derived(expanded ? rows : rows.slice(0, LIMIT));
	const total = $derived(status.rows.length);
</script>

<Section title="Agreements" description="Practices whose client agreement isn't complete yet." flush>
	{#if total === 0}
		<div class="p-5 sm:p-6">
			<EmptyState icon={FileSignature} title="Every agreement is signed" description="Practices without a completed agreement show up here." />
		</div>
	{:else}
		<div class="grid grid-cols-3 divide-x border-b">
			{#each AGREEMENT_STAGES as s (s)}
				{@const current = stage === s}
				<button
					type="button"
					aria-pressed={current}
					aria-label={`${status.counts[s]} ${AGREEMENT_STAGE_LABEL[s]}`}
					onclick={() => {
						stage = current ? 'all' : s;
						expanded = false;
					}}
					class={cn('px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring', current && 'bg-muted')}
				>
					<span class="block text-2xl font-extrabold tabular-nums">{status.counts[s]}</span>
					<span class="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground" title={AGREEMENT_STAGE_LABEL[s]}><span class={cn('size-2 shrink-0 rounded-full', TONE_SOLID[TONE[s]])}></span>{AGREEMENT_STAGE_SHORT[s]}</span>
				</button>
			{/each}
		</div>
		<ul class="divide-y">
			{#each shown as r (r.clientId)}
				<li>
					<a href={r.href} class="flex items-center justify-between gap-3 px-5 py-3 hover:bg-muted/40 sm:px-6">
						<span class="min-w-0">
							<span class="block truncate text-sm font-semibold">{r.name}</span>
							<span class="flex items-center gap-1.5 text-xs text-muted-foreground"><span class={cn('size-2 shrink-0 rounded-full', TONE_SOLID[TONE[r.stage]])}></span>{AGREEMENT_STAGE_LABEL[r.stage]}</span>
						</span>
						<span class="shrink-0 text-xs text-muted-foreground tabular-nums">{formatAge(r.since, now)}</span>
					</a>
				</li>
			{:else}
				<li class="px-5 py-6 text-center text-sm text-muted-foreground sm:px-6">Nothing in this stage.</li>
			{/each}
		</ul>
		{#if rows.length > LIMIT}
			<div class="border-t px-5 py-3 sm:px-6">
				<button type="button" class="text-sm font-semibold text-primary-dark hover:underline" onclick={() => (expanded = !expanded)}>
					{expanded ? 'Show fewer' : `Show all ${rows.length}`}
				</button>
			</div>
		{/if}
	{/if}
</Section>
