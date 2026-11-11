<script lang="ts">
	/** FactGrid header for a timesheet: professional, practice, week, totals. */
	import FactGrid from '$dtss/FactGrid.svelte';
	import { hoursText, usd } from '../timesheets';

	let {
		professional,
		professionalDetail,
		practice,
		practiceDetail,
		week,
		hours,
		total,
		estimate = true
	}: {
		professional: string;
		/** e.g. the PUID (admin) or email (practice). */
		professionalDetail?: string | null;
		practice: string;
		/** e.g. the discipline and request number. */
		practiceDetail?: string | null;
		week: string;
		hours: number;
		total: number;
		/** Before approval the invoice figure is a preview. */
		estimate?: boolean;
	} = $props();
</script>

{#snippet who()}
	<span class="block whitespace-normal break-words">{professional}</span>
	{#if professionalDetail}<span class="block whitespace-normal break-all text-sm font-normal text-muted-foreground">{professionalDetail}</span>{/if}
{/snippet}
{#snippet where()}
	<span class="block whitespace-normal break-words">{practice}</span>
	{#if practiceDetail}<span class="block whitespace-normal break-words text-sm font-normal text-muted-foreground">{practiceDetail}</span>{/if}
{/snippet}
{#snippet weekCell()}
	<span class="block whitespace-normal">{week}</span>
{/snippet}
{#snippet totals()}
	<span class="block">{hoursText(hours)} h</span>
	<span class="block whitespace-normal text-sm font-normal text-muted-foreground">{usd(total)} {estimate ? 'est. invoice' : 'invoiced'}</span>
{/snippet}

<FactGrid
	facts={[
		{ label: 'Professional', cell: who },
		{ label: 'Practice', cell: where },
		{ label: 'Week', cell: weekCell },
		{ label: 'Total', cell: totals }
	]}
/>
