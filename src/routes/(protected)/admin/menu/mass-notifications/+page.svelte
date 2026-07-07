<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;

	const statusColor: Record<string, string> = {
		DRAFT: 'bg-gray-100 text-gray-700',
		QUEUED: 'bg-blue-100 text-blue-700',
		SENDING: 'bg-amber-100 text-amber-700',
		COMPLETED: 'bg-green-100 text-green-700',
		CANCELLED: 'bg-gray-200 text-gray-600',
		FAILED: 'bg-red-100 text-red-700'
	};

	function fmt(d: string | Date | null) {
		if (!d) return '—';
		return new Date(d).toLocaleString();
	}
</script>

<section class="grow h-screen overflow-y-auto container mx-auto px-4 py-6">
	<div class="flex items-center justify-between p-6">
		<div>
			<h1 class="text-3xl font-extrabold tracking-tighter md:text-4xl">Mass Notifications</h1>
			<p class="text-sm text-gray-500 mt-1">
				Targeted SMS &amp; email to existing candidates and clients.
			</p>
		</div>
		<a
			href="/admin/menu/mass-notifications/create"
			class="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
		>
			New mass notification
		</a>
	</div>

	<div class="px-6 pb-10">
		{#if data.campaigns.length === 0}
			<p class="text-gray-500">No mass notifications yet.</p>
		{:else}
			<table class="w-full text-sm border-collapse">
				<thead>
					<tr class="border-b text-left text-gray-500">
						<th class="py-2 pr-4">Name</th>
						<th class="py-2 pr-4">Audience</th>
						<th class="py-2 pr-4">Channel</th>
						<th class="py-2 pr-4">Status</th>
						<th class="py-2 pr-4">Sent</th>
						<th class="py-2 pr-4">Failed</th>
						<th class="py-2 pr-4">Total</th>
						<th class="py-2 pr-4">Created</th>
					</tr>
				</thead>
				<tbody>
					{#each data.campaigns as c}
						<tr class="border-b hover:bg-gray-50">
							<td class="py-2 pr-4">
								<a class="text-blue-600 hover:underline" href={`/admin/menu/mass-notifications/${c.id}`}>
									{c.name}
								</a>
							</td>
							<td class="py-2 pr-4">{c.audience}</td>
							<td class="py-2 pr-4">{c.channel}</td>
							<td class="py-2 pr-4">
								<span class={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor[c.status] ?? ''}`}>
									{c.status}
								</span>
							</td>
							<td class="py-2 pr-4">{c.sentCount}</td>
							<td class="py-2 pr-4">{c.failedCount}</td>
							<td class="py-2 pr-4">{c.recipientCount}</td>
							<td class="py-2 pr-4 text-gray-500">{fmt(c.createdAt)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</div>
</section>
