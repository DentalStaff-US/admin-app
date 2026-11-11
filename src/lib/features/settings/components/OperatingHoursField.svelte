<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Switch } from '$lib/components/ui/switch';
	import { dayRows, parseOperatingHours, setDayOpen, setDayTime } from '../operatingHours';

	// The form field holds the hours as a JSON string (clientCompanySchema.operatingHours).
	let { value = $bindable(''), name = 'operatingHours' }: { value?: string; name?: string } = $props();

	const hours = $derived(parseOperatingHours(value));
	const rows = $derived(dayRows(hours));
</script>

<!-- 06 › Settings: one row per day, a Switch and a time range (was a 12-column grid). -->
<ul class="divide-y">
	{#each rows as row (row.id)}
		<li class="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-2 py-3 sm:flex-nowrap">
			<div class="flex w-full items-center justify-between gap-3 sm:w-44 sm:shrink-0 sm:justify-start">
				<span class="text-sm font-semibold sm:w-24">
					{row.name}{#if !row.open}<span class="font-normal text-muted-foreground sm:hidden"> · Closed</span>{/if}
				</span>
				<Switch
					checked={row.open}
					aria-label={`Open on ${row.name}`}
					onCheckedChange={(open: boolean | undefined) => (value = JSON.stringify(setDayOpen(hours, row.id, !!open)))}
				/>
			</div>
			{#if row.open}
				<div class="flex flex-1 items-center gap-2">
					<Input
						type="time"
						class="w-full sm:w-36"
						aria-label={`${row.name} opens`}
						value={row.openTime}
						on:change={(e) => (value = JSON.stringify(setDayTime(hours, row.id, 'openTime', (e.currentTarget as HTMLInputElement).value)))}
					/>
					<span class="text-sm text-muted-foreground" aria-hidden="true">to</span>
					<Input
						type="time"
						class="w-full sm:w-36"
						aria-label={`${row.name} closes`}
						value={row.closeTime}
						on:change={(e) => (value = JSON.stringify(setDayTime(hours, row.id, 'closeTime', (e.currentTarget as HTMLInputElement).value)))}
					/>
				</div>
			{:else}
				<p class="hidden flex-1 text-sm text-muted-foreground sm:block">Closed</p>
			{/if}
		</li>
	{/each}
</ul>
<input type="hidden" {name} {value} />
