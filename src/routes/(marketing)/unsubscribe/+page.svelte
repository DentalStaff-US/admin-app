<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';

	export let data: PageData;
	export let form: ActionData;
</script>

<section class="mx-auto max-w-md px-4 py-24 text-center">
	{#if form?.done}
		<h1 class="text-2xl font-bold">You're unsubscribed</h1>
		<p class="mt-2 text-gray-600">
			You won't receive further mass emails from us. You'll still get essential account emails.
		</p>
	{:else if !data.valid}
		<h1 class="text-2xl font-bold">Invalid link</h1>
		<p class="mt-2 text-gray-600">This unsubscribe link is invalid or has expired.</p>
	{:else}
		<h1 class="text-2xl font-bold">Unsubscribe from emails?</h1>
		<p class="mt-2 text-gray-600">
			Confirm below to stop receiving mass emails. Essential account emails will still be sent.
		</p>
		<form method="POST" use:enhance class="mt-6">
			<input type="hidden" name="u" value={data.userId} />
			<input type="hidden" name="t" value={data.token} />
			<button
				type="submit"
				class="rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
			>
				Confirm unsubscribe
			</button>
		</form>
	{/if}
</section>
