<script lang="ts">
	import type { PageData } from './$types';
	import { enhance } from '$app/forms';

	export let data: PageData;

	let receiveEmail = data.receiveEmail;
	let receiveSms = data.receiveSms;
</script>

<svelte:head><title>Notification Preferences</title></svelte:head>

<section class="mx-auto max-w-2xl px-4 py-8">
	<a href="/settings" class="text-sm text-blue-600 hover:underline">← Back to settings</a>
	<h1 class="mt-2 text-2xl font-bold">Notification Preferences</h1>
	<p class="mt-1 text-sm text-gray-500">
		Choose how we can reach you with updates about work opportunities and announcements. These do
		not affect essential account messages (security, billing, verification).
	</p>

	<form method="POST" use:enhance class="mt-6 space-y-4">
		<label class="flex items-start gap-3 rounded-md border p-4">
			<input type="checkbox" name="receiveEmail" bind:checked={receiveEmail} class="mt-1" />
			<span>
				<span class="block font-medium">Email</span>
				<span class="block text-sm text-gray-500">Receive announcements and opportunities by email.</span>
			</span>
		</label>

		<label class="flex items-start gap-3 rounded-md border p-4">
			<input type="checkbox" name="receiveSms" bind:checked={receiveSms} class="mt-1" />
			<span>
				<span class="block font-medium">Text messages (SMS)</span>
				<span class="block text-sm text-gray-500">
					Receive announcements and opportunities by text. You can also reply STOP to any message to
					opt out.
				</span>
			</span>
		</label>

		<button
			type="submit"
			class="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
		>
			Save preferences
		</button>
	</form>
</section>
