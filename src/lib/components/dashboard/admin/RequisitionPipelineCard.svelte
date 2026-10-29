<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { StatusBadge } from '$lib/components/ui/status-badge';
	import Button from '$lib/components/ui/button/button.svelte';
	import { ArrowRight } from 'lucide-svelte';
	import { formatCurrency } from '$lib/_helpers';
	import { cn } from '$lib/utils';
	import type {
		PipelineRange,
		PipelineStatus,
		PipelineSummary
	} from '$lib/server/dashboard/shiftValueRule';

	export let summary: PipelineSummary;
	export let range: PipelineRange;

	const RANGES: { value: PipelineRange; label: string }[] = [
		{ value: '30d', label: 'Next 30 days' },
		{ value: 'month', label: 'This month' },
		{ value: 'all', label: 'All time' }
	];

	const ROWS: { status: PipelineStatus; label: string }[] = [
		{ status: 'OPEN', label: 'Open' },
		{ status: 'FILLED', label: 'Filled' },
		{ status: 'UNFULFILLED', label: 'Unfulfilled' },
		{ status: 'CANCELED', label: 'Cancelled' }
	];

	const dollars = (cents: number) => formatCurrency(cents / 100);
</script>

<Card.Root class="h-full">
	<Card.Content class="p-6 flex flex-col h-full">
		<div class="flex items-start justify-between gap-2">
			<p class="text-muted-foreground text-sm font-medium">Requisition Summary</p>
			<span class="text-muted-foreground text-xs">shifts · est. billing</span>
		</div>

		<nav class="mt-3 flex flex-wrap gap-1" aria-label="Summary range">
			{#each RANGES as r}
				<a
					href="?pipeline={r.value}"
					data-sveltekit-noscroll
					aria-current={range === r.value ? 'page' : undefined}
					class={cn(
						'rounded-md px-2 py-1 text-xs font-medium',
						range === r.value
							? 'bg-primary text-primary-foreground'
							: 'text-muted-foreground hover:bg-muted'
					)}
				>
					{r.label}
				</a>
			{/each}
		</nav>

		<ul class="mt-4 space-y-4 flex-1">
			{#each ROWS as row}
				{@const bucket = summary[row.status]}
				<li>
					<div class="flex items-center gap-2">
						<StatusBadge status={row.status} label={row.label} />
						<span class="flex-1 border-b border-dashed border-border" aria-hidden="true" />
						<span class="text-sm font-semibold tabular-nums">{dollars(bucket.billingCents)}</span>
					</div>
					<div class="mt-1 flex items-baseline justify-between">
						<p class="text-3xl font-bold tabular-nums">{bucket.count}</p>
						{#if bucket.marginCents > 0}
							<p class="text-muted-foreground text-xs tabular-nums">
								incl. {dollars(bucket.marginCents)} margin
							</p>
						{/if}
					</div>
				</li>
			{/each}
		</ul>

		<div class="mt-4">
			<Button variant="link" class="p-0 h-auto" href="/requisitions">
				View requisitions
				<ArrowRight size={16} class="ml-1" />
			</Button>
		</div>
	</Card.Content>
</Card.Root>
