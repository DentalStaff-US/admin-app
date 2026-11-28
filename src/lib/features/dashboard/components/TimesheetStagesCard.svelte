<script lang="ts">
	// Timesheets by stage. Each tile opens the Timesheets tab it counts.
	import Section from '$dtss/Section.svelte';
	import { STAGE_HINT, type TimesheetStageCount } from '../timesheetStages';
	import { TONE_SOLID } from './tones';

	let { stages }: { stages: TimesheetStageCount[] } = $props();

	const hours = (n: number) => `${n.toLocaleString('en-US', { maximumFractionDigits: 1 })} h`;
</script>

<Section title="Timesheets" description="Every timesheet by stage, right now." flush>
	{#snippet actions()}
		<a href="/timesheets?tab=all" class="text-sm font-semibold text-primary-dark hover:underline" aria-label="View all timesheets">View all</a>
	{/snippet}
	<ul class="grid grid-cols-2 gap-px bg-border sm:grid-cols-5">
		{#each stages as s (s.stage)}
			<li class="bg-card last:col-span-2 sm:last:col-span-1">
				<a href={s.href} title={STAGE_HINT[s.stage]} class="block h-full px-5 py-4 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
					<span class="block text-2xl font-extrabold tabular-nums">{s.count.toLocaleString('en-US')}</span>
					<span class="flex items-center gap-1.5 text-sm">
						<span class="size-2 shrink-0 rounded-full {TONE_SOLID[s.tone]}" aria-hidden="true"></span>
						{s.label}
					</span>
					<span class="text-xs text-muted-foreground tabular-nums">{hours(s.hours)}</span>
				</a>
			</li>
		{/each}
	</ul>
</Section>
