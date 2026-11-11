<script lang="ts">
	// At a glance (10 §4.1): each number links to the list it counts. Money
	// lives in PracticeBillingCard, shown only when billing is this user's.
	import Hint from '$dtss/Hint.svelte';
	import Section from '$dtss/Section.svelte';
	import { DASH } from '../format';
	import { FAILED_HINT, METRICS, metricHint } from '../metrics';
	import type { Metric, PracticeBilling } from '../types';

	type Glance = {
		openRequests: Metric<number>;
		shiftsThisMonth: Metric<{ filled: number; total: number }>;
		balance: Metric<PracticeBilling> | null;
	};

	let { glance }: { glance: Glance } = $props();
</script>

{#snippet value(m: Metric<unknown>, text: () => string)}
	{#if m.ok}{text()}{:else}<Hint text={FAILED_HINT}>{DASH}</Hint>{/if}
{/snippet}

<Section title="At a glance">
	<ul class="divide-y">
		<li><a href={METRICS.openRequests.href} class="flex items-baseline justify-between gap-4 py-3  hover:underline">
			<span class="text-sm text-muted-foreground"><Hint text={metricHint('openRequests')}>{METRICS.openRequests.label}</Hint></span>
			<span class="text-2xl font-extrabold tabular-nums">
				{@render value(glance.openRequests, () => String(glance.openRequests.ok ? glance.openRequests.value : ''))}
			</span>
		</a></li>
		<li><a href={METRICS.shiftsThisMonth.href} class="flex items-baseline justify-between gap-4 py-3 hover:underline">
			<span class="text-sm text-muted-foreground"><Hint text={metricHint('shiftsThisMonth')}>{METRICS.shiftsThisMonth.label}</Hint></span>
			<span class="text-2xl font-extrabold tabular-nums">
				{@render value(glance.shiftsThisMonth, () =>
					glance.shiftsThisMonth.ok ? `${glance.shiftsThisMonth.value.filled} / ${glance.shiftsThisMonth.value.total}` : ''
				)}
			</span>
		</a></li>
	</ul>
</Section>
