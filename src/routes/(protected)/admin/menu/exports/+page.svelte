<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	export let data;

	let from = '';
	let to = '';

	$: href = (key: string) => {
		const q = new URLSearchParams();
		if (from) q.set('from', from);
		if (to) q.set('to', to);
		const qs = q.toString();
		return `/admin/menu/exports/${key}${qs ? `?${qs}` : ''}`;
	};
</script>

<svelte:head><title>Exports | Admin</title></svelte:head>

<section class="grow h-screen overflow-y-auto container mx-auto px-4 py-6">
	<div class="p-6 flex flex-col gap-2">
		<h1 class="text-3xl font-extrabold tracking-tighter md:text-4xl">Exports</h1>
		<p class="text-sm text-gray-600">
			CSV downloads for bookkeeping and reporting. Dates are optional and inclusive — leave both
			blank for everything. Money columns are plain decimals so they stay numeric in a spreadsheet.
		</p>
	</div>

	<div class="px-6 flex flex-wrap items-end gap-3">
		<div>
			<label class="block text-xs font-medium text-gray-500" for="from">From</label>
			<input
				id="from"
				type="date"
				bind:value={from}
				class="mt-1 rounded border border-gray-300 px-2 py-1 text-sm"
			/>
		</div>
		<div>
			<label class="block text-xs font-medium text-gray-500" for="to">To</label>
			<input
				id="to"
				type="date"
				bind:value={to}
				class="mt-1 rounded border border-gray-300 px-2 py-1 text-sm"
			/>
		</div>
		{#if from || to}
			<button
				class="text-sm text-gray-500 underline"
				on:click={() => {
					from = '';
					to = '';
				}}>clear</button
			>
		{/if}
	</div>

	{#each data.groups as g}
		<div class="px-6 pt-8">
			<h2 class="text-xl font-semibold">{g.group}</h2>
			<div class="mt-3 grid gap-4 md:grid-cols-2">
				{#each g.items as e}
					<div class="rounded-lg border border-gray-200 bg-white p-5">
						<p class="font-semibold">{e.label}</p>
						<p class="mt-1 text-sm text-gray-600">{e.description}</p>
						<p class="mt-2 text-xs text-gray-500">Date range filters on: {e.dateField}</p>
						<div class="mt-4">
							<Button variant="outline" href={href(e.key)}>Download CSV</Button>
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/each}
</section>
