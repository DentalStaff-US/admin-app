<script lang="ts">
	import { enhance } from '$app/forms';
	import * as Card from '$lib/components/ui/card';
	import Button from '$lib/components/ui/button/button.svelte';
	import { StatusBadge } from '$lib/components/ui/status-badge';
	import { ArrowRight, ShieldCheck } from 'lucide-svelte';
	import { COMPLIANCE_SEVERITIES, SEVERITY_LABELS } from '$lib/config/compliance';
	import type { ComplianceSummary } from '$lib/server/compliance/complianceRule';

	export let summary: ComplianceSummary;

	$: total = COMPLIANCE_SEVERITIES.reduce((n, s) => n + summary.counts[s], 0);

	let pending: string | null = null;
	const submitting = (key: string) => () => {
		pending = key;
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			pending = null;
		};
	};
</script>

<Card.Root>
	<Card.Header class="flex flex-row items-center justify-between pb-2">
		<Card.Title class="text-lg font-semibold">Compliance</Card.Title>
		<Button variant="link" class="p-0 h-auto" href="/admin/compliance">
			View all
			<ArrowRight size={16} class="ml-1" />
		</Button>
	</Card.Header>
	<Card.Content>
		{#if total === 0}
			<div class="flex items-center gap-2 text-muted-foreground py-2">
				<ShieldCheck size={20} />
				<span>All professionals compliant{summary.snoozed ? ` (${summary.snoozed} snoozed)` : ''}</span>
			</div>
		{:else}
			<div class="grid grid-cols-2 md:grid-cols-4 gap-3">
				{#each COMPLIANCE_SEVERITIES as s}
					<a
						href="/admin/compliance?severity={s}"
						class="rounded-md border p-3 hover:bg-muted"
					>
						<StatusBadge status={s} label={SEVERITY_LABELS[s]} />
						<p class="mt-2 text-3xl font-bold tabular-nums">{summary.counts[s]}</p>
					</a>
				{/each}
			</div>

			<ul class="mt-4 divide-y">
				{#each summary.top as item (item.subjectId + item.ruleKey)}
					{@const key = item.subjectId + item.ruleKey}
					<li class="flex flex-wrap items-center gap-3 py-2">
						<StatusBadge status={item.severity} label={SEVERITY_LABELS[item.severity]} />
						<div class="min-w-0 flex-1">
							<a href="/professionals/{item.subjectId}" class="font-medium hover:underline">
								{item.subjectName}
							</a>
							<p class="text-muted-foreground text-sm truncate">{item.title} — {item.detail}</p>
						</div>
						{#if item.remindable}
							<form
								method="POST"
								action="/admin/compliance?/sendReminder"
								use:enhance={submitting(key)}
							>
								<input type="hidden" name="candidateId" value={item.subjectId} />
								<input type="hidden" name="ruleKey" value={item.ruleKey} />
								<Button
									type="submit"
									size="sm"
									variant="outline"
									disabled={!!item.remindedAt || pending === key}
								>
									{item.remindedAt ? 'Reminded' : pending === key ? 'Sending…' : 'Remind'}
								</Button>
							</form>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</Card.Content>
</Card.Root>
