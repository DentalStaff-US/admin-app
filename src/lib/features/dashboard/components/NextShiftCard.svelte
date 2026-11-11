<script lang="ts">
	// The welcome banner's floating card (10 §4.1): the next confirmed shift, or the
	// first-request prompt with the ghost stack when nothing is booked.
	import { CalendarCheck } from 'lucide-svelte';
	import GhostStack from '$dtss/GhostStack.svelte';
	import IconSquare from '$dtss/IconSquare.svelte';
	import type { Snippet } from 'svelte';
	import { formatTimeRange, relativeDay } from '../format';
	import type { CoverageShift } from '../types';

	let {
		shift,
		showLocation,
		now = new Date(),
		cta
	}: { shift: CoverageShift | null; showLocation: boolean; now?: Date; cta?: Snippet } = $props();
</script>

{#if shift}
	<a
		href="/requisitions/{shift.requisitionId}"
		class="flex items-center gap-4 rounded-2xl border bg-card p-5 shadow-float transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
	>
		<IconSquare icon={CalendarCheck} tone="positive" />
		<div class="min-w-0">
			<p class="text-overline uppercase text-muted-foreground">Next confirmed shift</p>
			<p class="mt-0.5 font-bold">{shift.disciplineName} · {relativeDay(shift.dayStart, shift.timezone, now)}</p>
			<p class="text-sm text-muted-foreground">
				{formatTimeRange(shift.dayStart, shift.dayEnd, shift.timezone)}{showLocation ? ` · ${shift.locationName}` : ''}
			</p>
			<p class="mt-1 text-sm font-semibold text-status-positive-fg">{shift.professionalName} confirmed</p>
		</div>
	</a>
{:else}
	<div class="rounded-2xl border bg-card p-5 shadow-card">
		<GhostStack />
		<p class="mt-4 text-center font-bold">Nothing booked yet</p>
		<p class="mt-1 text-center text-sm text-muted-foreground">Post a request and your confirmed professionals show up here.</p>
		{#if cta}<div class="mt-4 flex justify-center">{@render cta()}</div>{/if}
	</div>
{/if}
