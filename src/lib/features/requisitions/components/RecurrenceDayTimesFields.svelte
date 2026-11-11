<script lang="ts">
	import { AlertTriangle } from 'lucide-svelte';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { cn } from '$lib/utils';
	import { shiftDurationLabel, type DayTimes } from '../recurrenceDays';

	let { times = $bindable(), idPrefix }: { times: DayTimes; idPrefix: string } = $props();

	const duration = $derived(shiftDurationLabel(times.dayStartTime, times.dayEndTime));
</script>

<!-- One day's hours: start/end required, lunch optional. -->
<div class="grid grid-cols-2 gap-3">
	<div class="space-y-1.5">
		<Label for="{idPrefix}-start" class="text-sm font-semibold">Starts</Label>
		<Input id="{idPrefix}-start" type="time" bind:value={times.dayStartTime} required class="text-base sm:text-sm" />
	</div>
	<div class="space-y-1.5">
		<Label for="{idPrefix}-end" class="text-sm font-semibold">Ends</Label>
		<Input id="{idPrefix}-end" type="time" bind:value={times.dayEndTime} required class="text-base sm:text-sm" />
	</div>
	<div class="space-y-1.5">
		<Label for="{idPrefix}-lunch-start" class="text-sm font-semibold">
			Lunch starts <span class="font-normal text-muted-foreground">(optional)</span>
		</Label>
		<Input id="{idPrefix}-lunch-start" type="time" bind:value={times.lunchStartTime} class="text-base sm:text-sm" />
	</div>
	<div class="space-y-1.5">
		<Label for="{idPrefix}-lunch-end" class="text-sm font-semibold">
			Lunch ends <span class="font-normal text-muted-foreground">(optional)</span>
		</Label>
		<Input id="{idPrefix}-lunch-end" type="time" bind:value={times.lunchEndTime} class="text-base sm:text-sm" />
	</div>
</div>
{#if duration}
	<p
		class={cn('mt-2 flex items-center gap-1.5 text-sm', duration.invalid ? 'font-semibold text-destructive' : 'text-muted-foreground')}
		role={duration.invalid ? 'alert' : undefined}
	>
		{#if duration.invalid}<AlertTriangle class="size-4" aria-hidden="true" />{/if}
		{duration.text}
	</p>
{/if}
