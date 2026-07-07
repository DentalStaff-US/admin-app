<script lang="ts">
	import type { PageData } from './$types';
	import { enhance } from '$app/forms';

	export let data: PageData;

	$: campaign = data.campaign;
	$: pending = campaign.recipientCount - campaign.sentCount - campaign.failedCount;
	$: canCancel = ['QUEUED', 'SENDING', 'DRAFT'].includes(campaign.status);

	const statusColor: Record<string, string> = {
		DRAFT: 'bg-gray-100 text-gray-700',
		QUEUED: 'bg-blue-100 text-blue-700',
		SENDING: 'bg-amber-100 text-amber-700',
		COMPLETED: 'bg-green-100 text-green-700',
		CANCELLED: 'bg-gray-200 text-gray-600',
		FAILED: 'bg-red-100 text-red-700'
	};
	const recipColor: Record<string, string> = {
		PENDING: 'text-gray-500',
		SENT: 'text-green-600',
		FAILED: 'text-red-600',
		SKIPPED: 'text-gray-400'
	};

	function fmt(d: string | Date | null) {
		return d ? new Date(d).toLocaleString() : '—';
	}
</script>

<section class="grow h-screen overflow-y-auto container mx-auto px-4 py-6">
	<div class="p-6">
		<a href="/admin/menu/mass-notifications" class="text-sm text-blue-600 hover:underline">
			← Back to mass notifications
		</a>
		<div class="mt-2 flex items-start justify-between">
			<div>
				<h1 class="text-3xl font-extrabold tracking-tighter md:text-4xl">{campaign.name}</h1>
				<p class="mt-1 text-sm text-gray-500">
					{campaign.audience} · {campaign.channel} · created {fmt(campaign.createdAt)}
				</p>
			</div>
			<span class={`rounded-full px-3 py-1 text-sm font-medium ${statusColor[campaign.status] ?? ''}`}>
				{campaign.status}
			</span>
		</div>
	</div>

	<div class="px-6 grid grid-cols-2 md:grid-cols-4 gap-4">
		<div class="rounded-md border p-4"><p class="text-xs text-gray-500">Total</p><p class="text-2xl font-bold">{campaign.recipientCount}</p></div>
		<div class="rounded-md border p-4"><p class="text-xs text-gray-500">Sent</p><p class="text-2xl font-bold text-green-600">{campaign.sentCount}</p></div>
		<div class="rounded-md border p-4"><p class="text-xs text-gray-500">Failed</p><p class="text-2xl font-bold text-red-600">{campaign.failedCount}</p></div>
		<div class="rounded-md border p-4"><p class="text-xs text-gray-500">Pending</p><p class="text-2xl font-bold text-gray-600">{pending}</p></div>
	</div>

	<div class="px-6 pt-4">
		{#if campaign.subject}<p class="text-sm"><span class="font-semibold">Subject:</span> {campaign.subject}</p>{/if}
		<p class="mt-2 whitespace-pre-wrap rounded-md border bg-gray-50 p-3 text-sm">{campaign.body}</p>
	</div>

	{#if canCancel}
		<div class="px-6 pt-4">
			<form method="POST" action="?/cancel" use:enhance>
				<button
					type="submit"
					class="rounded-md border border-red-300 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
				>
					Cancel remaining sends
				</button>
			</form>
		</div>
	{/if}

	<div class="px-6 py-6">
		<h2 class="mb-2 text-lg font-semibold">Recipients</h2>
		<table class="w-full text-sm border-collapse">
			<thead>
				<tr class="border-b text-left text-gray-500">
					<th class="py-2 pr-4">Name</th>
					<th class="py-2 pr-4">To</th>
					<th class="py-2 pr-4">Status</th>
					<th class="py-2 pr-4">Sent at</th>
					<th class="py-2 pr-4">Error</th>
				</tr>
			</thead>
			<tbody>
				{#each data.recipients as r}
					<tr class="border-b">
						<td class="py-2 pr-4">{[r.firstName, r.lastName].filter(Boolean).join(' ') || '—'}</td>
						<td class="py-2 pr-4">{r.toAddress}</td>
						<td class={`py-2 pr-4 font-medium ${recipColor[r.status] ?? ''}`}>{r.status}</td>
						<td class="py-2 pr-4 text-gray-500">{fmt(r.sentAt)}</td>
						<td class="py-2 pr-4 text-xs text-red-500">{r.error ?? ''}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</section>
