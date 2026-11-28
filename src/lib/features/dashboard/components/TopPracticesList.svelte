<script lang="ts">
	// The practices billed the most in the last 12 weeks, as a ranked bar list.
	import Section from '$dtss/Section.svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import { Building2 } from 'lucide-svelte';
	import { formatMoneyTile, plural } from '../format';
	import type { PracticeRank } from '../trends';

	let { practices }: { practices: PracticeRank[] } = $props();
	const max = $derived(Math.max(1, ...practices.map((p) => p.billed)));
</script>

<Section title="Top practices" description="By amount invoiced, last 12 weeks.">
	{#snippet actions()}<a href="/clients" class="text-sm font-semibold text-primary-dark hover:underline" aria-label="View all practices">View all</a>{/snippet}
	{#if practices.length === 0}
		<EmptyState icon={Building2} title="No invoices yet" description="Practices show up here once they've been invoiced." />
	{:else}
		<ol class="space-y-3">
			{#each practices as p, i (p.clientId)}
				<li>
					<a href="/clients/{p.clientId}" class="group block">
						<span class="flex items-baseline justify-between gap-3 text-sm">
							<span class="min-w-0 truncate font-semibold group-hover:underline"><span class="mr-1 text-muted-foreground tabular-nums">{i + 1}.</span>{p.name}</span>
							<span class="shrink-0 font-bold tabular-nums">{formatMoneyTile(p.billed)}</span>
						</span>
						<span class="mt-1 flex items-center gap-2">
							<span class="h-2 flex-1 overflow-hidden rounded-full bg-muted">
								<span class="block h-full rounded-full bg-primary" style="width: {(p.billed / max) * 100}%"></span>
							</span>
							<span class="w-20 shrink-0 text-right text-xs text-muted-foreground">{plural(p.invoices, 'invoice')}</span>
						</span>
					</a>
				</li>
			{/each}
		</ol>
	{/if}
</Section>
