<script lang="ts">
	import type { LayoutData } from './$types';
	import DashboardNav from '$lib/components/navigation/dashboard-nav.svelte';
	import { ProgressBar } from '@prgm/sveltekit-progress-bar';
	import { authClient } from '$lib/auth-client';
	import { invalidateAll } from '$app/navigation';

	export let data: LayoutData;

	$: user = data.user;
	$: isOfficeAdmin = data.isOfficeAdmin;

	let exiting = false;
	async function stopImpersonating() {
		exiting = true;
		await authClient.admin.stopImpersonating();
		exiting = false;
		// Restores the admin's own session; reload to reflect it.
		window.location.href = '/admin/menu/users';
	}
</script>

<ProgressBar class="text-blue-500 h-3" />
<div class="flex h-screen flex-col">
	{#if data.impersonating}
		<div
			class="flex shrink-0 items-center justify-center gap-3 bg-amber-500 px-4 py-2 text-sm font-medium text-amber-950"
		>
			<span>
				You are impersonating {user?.firstName} {user?.lastName} ({user?.email}).
			</span>
			<button
				class="rounded bg-amber-950 px-3 py-1 text-amber-50 disabled:opacity-50"
				on:click={stopImpersonating}
				disabled={exiting}
			>
				{exiting ? 'Exiting…' : 'Exit impersonation'}
			</button>
		</div>
	{/if}
	<div class="flex w-full min-h-0 grow overflow-hidden bg-gray-100 pl-20">
		<DashboardNav {user} {isOfficeAdmin} />
		<div class="grow h-full overflow-y-auto">
			<slot />
		</div>
	</div>
</div>
