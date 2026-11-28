<script lang="ts">
	import { Download, FileSpreadsheet } from 'lucide-svelte';
	import ConfirmDialog from '$dtss/ConfirmDialog.svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import Section from '$dtss/Section.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { exportHref } from './comms';

	export type ExportItem = { key: string; label: string; description: string; dateField: string };
	export type ExportGroup = { group: string; items: ExportItem[] };

	let { groups }: { groups: ExportGroup[] } = $props();

	let from = $state('');
	let to = $state('');
	let pending = $state<ExportItem | null>(null);
	let confirmOpen = $state(false);

	const range = $derived(
		from && to ? `${from} to ${to}` : from ? `from ${from} on` : to ? `up to ${to}` : 'all dates'
	);

	function ask(item: ExportItem) {
		pending = item;
		confirmOpen = true;
	}
</script>

<Section title="Date range" description="Optional and inclusive. Leave both blank for everything.">
	<div class="flex flex-wrap items-end gap-3">
		<div class="space-y-2">
			<Label for="export-from">From</Label>
			<Input id="export-from" type="date" class="w-44" bind:value={from} />
		</div>
		<div class="space-y-2">
			<Label for="export-to">To</Label>
			<Input id="export-to" type="date" class="w-44" bind:value={to} />
		</div>
		{#if from || to}
			<Button variant="ghost" on:click={() => ((from = ''), (to = ''))}>Clear dates</Button>
		{/if}
	</div>
</Section>

{#if groups.length === 0}
	<EmptyState icon={FileSpreadsheet} title="No exports available" description="CSV exports appear here as they're added to the platform." />
{/if}

{#each groups as g (g.group)}
	<Section title={g.group} flush>
		<ul class="divide-y">
			{#each g.items as e (e.key)}
				<li class="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
					<div class="min-w-0">
						<p class="font-semibold">{e.label}</p>
						<p class="mt-0.5 text-sm text-muted-foreground">{e.description}</p>
						<p class="mt-1 text-caption text-muted-foreground">Date range filters on {e.dateField}</p>
					</div>
					<Button variant="outline" class="shrink-0" on:click={() => ask(e)}>
						<Download class="mr-2 size-4" aria-hidden="true" /> Download CSV
					</Button>
				</li>
			{/each}
		</ul>
	</Section>
{/each}

<ConfirmDialog
	bind:open={confirmOpen}
	title={pending ? `Download ${pending.label.toLowerCase()} (${range})?` : 'Download export?'}
	description="The file can include names, contact and payment details. Keep it off shared drives and email, and delete it when you're done. Each download is logged with your name."
>
	{#snippet confirm()}
		{#if pending}
			<Button href={exportHref(pending.key, from, to)} data-sveltekit-reload on:click={() => (confirmOpen = false)}>
				<Download class="mr-2 size-4" aria-hidden="true" /> Download CSV
			</Button>
		{/if}
	{/snippet}
</ConfirmDialog>
