<script lang="ts">
	// Needs attention, compact (10 §3.1): one row per kind with its count, each
	// linking to the list that shows exactly that set. "See every item" opens
	// the full queue, with its inline Approve / Remind actions, in a side panel.
	import { AlertCircle, CheckCircle2, ChevronRight } from 'lucide-svelte';
	import Section from '$dtss/Section.svelte';
	import * as Sheet from '$lib/components/ui/sheet';
	import { cn } from '$lib/utils';
	import { attentionSummary, KIND_SHORT_LABEL } from '../attention';
	import type { AttentionGroup } from '../types';
	import AttentionQueue from './AttentionQueue.svelte';
	import { TONE_SOLID } from './tones';

	let { groups, now = new Date() }: { groups: AttentionGroup[]; now?: Date } = $props();

	const summary = $derived(attentionSummary(groups));
	const failed = $derived(summary.failedKinds.map((k) => KIND_SHORT_LABEL[k].toLowerCase()).join(', '));
	let open = $state(false);
</script>

<Section title="Needs attention" flush>
	{#snippet actions()}
		{#if summary.total > 0}
			<button type="button" class="text-sm font-semibold text-primary-dark hover:underline" onclick={() => (open = true)}>View all</button>
		{/if}
	{/snippet}
	{#if summary.rows.length === 0 && !failed}
		<p class="flex items-center gap-2 px-5 py-6 text-sm text-muted-foreground sm:px-6">
			<CheckCircle2 class="size-4 text-status-positive-fg" aria-hidden="true" /> Nothing needs you right now.
		</p>
	{:else}
		<ul class="divide-y">
			{#each summary.rows as r (r.kind)}
				<li>
					<svelte:element
						this={r.href ? 'a' : 'div'}
						href={r.href ?? undefined}
						class={cn('flex items-center gap-3 px-5 py-2.5 text-sm sm:px-6', r.href && 'group hover:bg-muted/40')}
					>
						<span class={cn('size-2 shrink-0 rounded-full', TONE_SOLID[r.tone])} aria-hidden="true"></span>
						<span class="min-w-0 flex-1 truncate group-hover:underline">{r.label}</span>
						<span class="font-bold tabular-nums">{r.count}</span>
						{#if r.href}<ChevronRight class="size-4 text-muted-foreground" aria-hidden="true" />{/if}
					</svelte:element>
				</li>
			{/each}
		</ul>
		{#if failed}
			<p class="flex items-center gap-2 border-t px-5 py-2.5 text-xs text-muted-foreground sm:px-6">
				<AlertCircle class="size-3.5" aria-hidden="true" /> Couldn't check {failed}. Refresh to try again.
			</p>
		{/if}
	{/if}
</Section>

<Sheet.Root bind:open>
	<Sheet.Content side="right" class="w-full p-0 sm:max-w-2xl">
		<Sheet.Header class="border-b px-6 py-4 text-left">
			<Sheet.Title class="text-h2">Needs attention</Sheet.Title>
		</Sheet.Header>
		<div class="p-4 sm:p-6">
			<AttentionQueue {groups} {now} syncUrl={false} />
		</div>
	</Sheet.Content>
</Sheet.Root>
