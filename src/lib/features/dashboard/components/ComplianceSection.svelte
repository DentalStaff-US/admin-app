<script lang="ts">
	// Compliance (10 §3.6): ComplianceCard's logic in the new layout. CRITICAL and
	// BLOCKED live in Needs attention, so this lists ACTION and WATCH, filtered in
	// place. The all-clear only renders from a successful load (10 W1).
	import { enhance } from '$app/forms';
	import { ShieldCheck } from 'lucide-svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import Hint from '$dtss/Hint.svelte';
	import Section from '$dtss/Section.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Popover from '$lib/components/ui/popover';
	import { SEVERITY_LABELS, SNOOZE_DAYS } from '$lib/config/compliance';
	import { cn } from '$lib/utils';
	import type { ComplianceSectionData } from '../compliance';
	import { formatAge, plural } from '../format';
	import { ACTION_HINTS } from '../hints';
	import type { Metric } from '../types';
	import FailedLine from './FailedLine.svelte';
	import SeverityBadge from './SeverityBadge.svelte';

	let { data, now = new Date() }: { data: Metric<ComplianceSectionData>; now?: Date } = $props();

	let filter = $state<'ACTION' | 'WATCH' | 'all'>('all');
	let pending = $state<string | null>(null);

	const submitting = (key: string) => () => {
		pending = key;
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			pending = null;
		};
	};
</script>

<Section title="Compliance" description="Credentials that need follow-up or expire soon">
	{#snippet actions()}
		<a href="/admin/compliance" class="text-sm font-semibold text-primary-dark hover:underline">View all</a>
	{/snippet}
	{#if !data.ok}
		<!-- Never the all-clear from a fallback: an expired license could be hiding here. -->
		<FailedLine what="compliance (credentials weren't checked)" />
	{:else}
		{@const d = data.value}
		{@const urgent = d.counts.CRITICAL + d.counts.BLOCKED}
		{@const listed = d.counts.ACTION + d.counts.WATCH}
		{#if urgent}
			<p class="mb-3 text-sm">
				<a href="#attention-title" class="font-semibold text-status-negative-fg hover:underline">
					{plural(urgent, 'critical or blocked item')} in Needs attention ↑
				</a>
			</p>
		{/if}
		{#if listed === 0}
			{#if !urgent}
				<EmptyState
					icon={ShieldCheck}
					title="Everyone's credentials are current"
					description={d.snoozed ? `${plural(d.snoozed, 'item')} snoozed` : 'Nothing expiring or missing.'}
				/>
			{:else}
				<p class="text-sm text-muted-foreground">Nothing else expiring or missing{d.snoozed ? ` · ${d.snoozed} snoozed` : ''}.</p>
			{/if}
		{:else}
			<div role="radiogroup" aria-label="Filter by severity" class="flex flex-wrap gap-1">
				{#each [{ v: 'all', label: 'All', n: listed }, { v: 'ACTION', label: SEVERITY_LABELS.ACTION, n: d.counts.ACTION }, { v: 'WATCH', label: SEVERITY_LABELS.WATCH, n: d.counts.WATCH }] as chip (chip.v)}
					{#if chip.n > 0}
						<button
							type="button"
							role="radio"
							aria-checked={filter === chip.v}
							onclick={() => (filter = chip.v as typeof filter)}
							class={cn(
								'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
								filter === chip.v && 'border-primary bg-primary-soft text-foreground'
							)}
						>
							{chip.label}<span class="text-xs tabular-nums">{chip.n}</span>
						</button>
					{/if}
				{/each}
				{#if d.snoozed}<span class="self-center pl-2 text-sm text-muted-foreground">· {d.snoozed} snoozed</span>{/if}
			</div>
			<ul class="-mx-5 mt-3 divide-y border-t sm:-mx-6">
				{#each d.items.filter((i) => filter === 'all' || i.severity === filter) as item (item.key)}
					<li class="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:gap-3 sm:px-6">
						<div class="flex min-w-0 flex-1 items-start gap-3">
							<SeverityBadge severity={item.severity} />
							<div class="min-w-0">
								<a href="/professionals/{item.subjectId}" class="font-semibold hover:underline">{item.subjectName}</a>
								<p class="text-sm text-muted-foreground">{item.title} · {item.detail}</p>
							</div>
						</div>
						<div class="flex shrink-0 items-center gap-2 pl-0 sm:pl-0">
							{#if item.remindable}
								{#if item.remindedAt}
									<Hint text="Reminded {formatAge(new Date(item.remindedAt), now)} ago. You can send another tomorrow.">
										<span class="inline-flex h-9 cursor-not-allowed items-center rounded-md border border-input px-3 text-sm text-muted-foreground opacity-70">Reminded</span>
									</Hint>
								{:else}
									<form method="POST" action="/admin/compliance?/sendReminder" use:enhance={submitting(item.key + 'r')}>
										<input type="hidden" name="candidateId" value={item.subjectId} />
										<input type="hidden" name="ruleKey" value={item.ruleKey} />
										<Hint text={ACTION_HINTS.remind}>
											<Button type="submit" size="sm" variant="outline" disabled={pending === item.key + 'r'}>
												{pending === item.key + 'r' ? 'Sending…' : 'Remind'}
											</Button>
										</Hint>
									</form>
								{/if}
							{/if}
							<Popover.Root>
								<Popover.Trigger
									class="inline-flex h-9 items-center rounded-md px-3 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>
									Snooze
								</Popover.Trigger>
								<Popover.Content class="w-64" align="end">
									<form method="POST" action="/admin/compliance?/snooze" use:enhance={submitting(item.key + 's')} class="space-y-3">
										<input type="hidden" name="candidateId" value={item.subjectId} />
										<input type="hidden" name="ruleKey" value={item.ruleKey} />
										<p class="text-xs text-muted-foreground">{ACTION_HINTS.snooze}</p>
										<label class="block text-sm font-medium">
											For
											<select name="days" class="mt-1 h-9 w-full rounded-md border border-input bg-background px-2">
												{#each SNOOZE_DAYS as days (days)}<option value={days}>{days} days</option>{/each}
											</select>
										</label>
										<label class="block text-sm font-medium">
											Note <span class="font-normal text-muted-foreground">(optional)</span>
											<input name="note" maxlength="500" placeholder="e.g. renewal in progress" class="mt-1 h-9 w-full rounded-md border border-input bg-background px-2" />
										</label>
										<Button type="submit" size="sm" class="w-full" disabled={pending === item.key + 's'}>Snooze</Button>
									</form>
								</Popover.Content>
							</Popover.Root>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</Section>
