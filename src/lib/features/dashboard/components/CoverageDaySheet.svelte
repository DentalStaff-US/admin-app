<script lang="ts">
	// That day's shifts at one location (10 §3.2): read-only, with a way to assign.
	import * as Sheet from '$lib/components/ui/sheet';
	import StatusBadge from '$dtss/StatusBadge.svelte';
	import { Button } from '$lib/components/ui/button';
	import { formatDateOnly, formatTimeRange } from '../format';
	import { statusHint } from '../hints';
	import type { CoverageCell } from '../coverage';

	let {
		open = $bindable(false),
		cell,
		title,
		audience = 'admin'
	}: { open?: boolean; cell: CoverageCell | null; title: string; audience?: 'admin' | 'practice' } = $props();
</script>

<Sheet.Root bind:open>
	<Sheet.Content side="right" class="flex w-full flex-col gap-0 p-0 sm:max-w-md">
		{#if cell}
			<Sheet.Header class="border-b px-6 py-4 text-left">
				<Sheet.Title class="text-h2">{title}</Sheet.Title>
				<Sheet.Description>
					{formatDateOnly(cell.date, 'EEEE, MMM d')} · {cell.filled} of {cell.total} filled
				</Sheet.Description>
			</Sheet.Header>
			<ul class="flex-1 divide-y overflow-y-auto">
				{#each cell.shifts as s (s.id)}
					<li class="flex items-start justify-between gap-3 px-6 py-4">
						<div class="min-w-0">
							<p class="font-semibold">{s.disciplineName}</p>
							<p class="text-sm tabular-nums text-muted-foreground">{formatTimeRange(s.dayStart, s.dayEnd, s.timezone)}</p>
							<p class="mt-1 text-sm">
								{#if s.professionalName}{s.professionalName}{:else}<span class="text-muted-foreground">Nobody booked yet</span>{/if}
							</p>
						</div>
						<div class="flex shrink-0 flex-col items-end gap-2">
							<StatusBadge status={s.status} hint={statusHint(s.status, audience)} />
							{#if audience === 'admin' && s.status === 'OPEN'}
								<Button size="sm" href="/requisitions/{s.requisitionId}">Assign</Button>
							{:else}
								<Button size="sm" variant="ghost" href="/requisitions/{s.requisitionId}">View request</Button>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</Sheet.Content>
</Sheet.Root>
