<script lang="ts">
	import { page } from '$app/state';
	import AdminShell from '$shell/AdminShell.svelte';
	import FocusShell from '$shell/FocusShell.svelte';
	import ImpersonationBar from '$shell/ImpersonationBar.svelte';
	import Notice from '$dtss/Notice.svelte';
	import Page from '$dtss/Page.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';
	import { Button } from '$lib/components/ui/button';

	// /_dev/preview/shell?role=SUPERADMIN|ADMIN|CLIENT|CLIENT_STAFF&office=1&rail=1&as=1&path=/requisitions/1042&focus=1&banner=1&long=1
	const q = $derived(page.url.searchParams);
	const role = $derived(q.get('role') ?? 'SUPERADMIN');
	const path = $derived(q.get('path') ?? '/dashboard');
	let sidebar = $state<'expanded' | 'rail'>(page.url.searchParams.get('rail') ? 'rail' : 'expanded');
</script>

{#snippet impersonation()}
	{#if q.get('as')}<ImpersonationBar name="Bright Smiles Dental" email="owner@brightsmiles.test" />{/if}
{/snippet}

{#snippet body()}
	<Page>
		<PageHeader title="Requests" description="Every temp and permanent request across your locations.">
			{#snippet actions()}<Button>New request</Button>{/snippet}
		</PageHeader>
		<div class="grid gap-4 md:grid-cols-3">
			{#each Array(q.get('long') ? 24 : 6) as _, i (i)}
				<div class="rounded-lg border bg-card p-5 shadow-card">
					<p class="text-sm text-muted-foreground">Card {i + 1}</p>
					<p class="mt-2 text-h3">Placeholder content</p>
				</div>
			{/each}
		</div>
	</Page>
{/snippet}

{#if q.get('focus')}
	<FocusShell topBanner={impersonation}>{@render body()}</FocusShell>
{:else}
	<AdminShell
		pathname={path}
		nav={{ role, isOfficeAdmin: !!q.get('office') }}
		bind:sidebar
		canSearch={role === 'SUPERADMIN' || role === 'ADMIN'}
		name="Shannon Carter"
		email="shannon@dtss.test"
		initials="SC"
		unreadCount={Number(q.get('unread') ?? 3)}
		topBanner={impersonation}
		topBannerShown={!!q.get('as')}
	>
		{#snippet banner()}
			{#if q.get('banner')}<Notice tone="warning" title="Payment method needed">Add a card or bank account to keep posting requests.</Notice>{/if}
		{/snippet}
		{@render body()}
	</AdminShell>
{/if}
