<script lang="ts">
	import Section from '$dtss/Section.svelte';
	import { dayRows, parseOperatingHours } from '../operatingHours';
	import SettingsPanel from './SettingsPanel.svelte';

	// Read-only for staff without admin rights. Their old form had no action
	// and couldn't save, and only practice admins should change these.
	let { companyForm }: { companyForm: any } = $props();

	const data = $derived(companyForm?.data ?? {});
	const days = $derived(dayRows(parseOperatingHours(data.operatingHours)));
	const facts = $derived([
		{ label: 'Practice name', value: data.companyName },
		{ label: 'Base location', value: data.baseLocation },
		{ label: 'Website', value: data.website }
	]);
</script>

<SettingsPanel title="Practice" description="Details of the practice you work for. Ask a practice admin to change them.">
	<Section title="Practice details" flush>
		<dl class="divide-y">
			{#each facts as fact (fact.label)}
				<div class="grid gap-1 px-5 py-4 sm:grid-cols-3 sm:px-6">
					<dt class="text-sm font-semibold text-muted-foreground">{fact.label}</dt>
					<dd class="break-words text-sm sm:col-span-2">{fact.value || '—'}</dd>
				</div>
			{/each}
			{#if data.companyDescription}
				<div class="grid gap-1 px-5 py-4 sm:grid-cols-3 sm:px-6">
					<dt class="text-sm font-semibold text-muted-foreground">About</dt>
					<dd class="whitespace-pre-line text-sm sm:col-span-2">{data.companyDescription}</dd>
				</div>
			{/if}
		</dl>
	</Section>

	<Section title="Operating hours" flush>
		<ul class="divide-y">
			{#each days as day (day.id)}
				<li class="flex justify-between gap-4 px-5 py-3 text-sm sm:px-6">
					<span class="font-semibold">{day.name}</span>
					<span class={day.open ? 'tabular-nums' : 'text-muted-foreground'}>
						{day.open ? `${day.openTime} – ${day.closeTime}` : 'Closed'}
					</span>
				</li>
			{/each}
		</ul>
	</Section>
</SettingsPanel>
