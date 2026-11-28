<script lang="ts">
	import { page } from '$app/state';
	import convertNameToInitials from '$lib/_helpers/convertNameToInitials';
	import { checkIsAdmin } from '$lib/_helpers/checkIsAdmin';
	import AdminShell from '$shell/AdminShell.svelte';
	import FocusShell from '$shell/FocusShell.svelte';
	import ImpersonationBar from '$shell/ImpersonationBar.svelte';
	import { usesFocusShell } from '$lib/nav/nav';

	let { data, children } = $props();

	const user = $derived(data.user);
	const name = $derived([user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Account');
	const initials = $derived(convertNameToInitials(user?.firstName ?? '', user?.lastName ?? ''));
	let sidebar = $state(data.sidebar);
</script>

{#snippet impersonation()}
	{#if data.impersonating}
		<ImpersonationBar {name} email={user?.email} />
	{/if}
{/snippet}

{#if usesFocusShell(page.url.pathname)}
	<FocusShell topBanner={impersonation}>
		{@render children()}
	</FocusShell>
{:else}
	<AdminShell
		pathname={page.url.pathname}
		search={page.url.search}
		nav={{ role: user?.role, isOfficeAdmin: data.isOfficeAdmin }}
		bind:sidebar
		canSearch={checkIsAdmin(user?.role)}
		{name}
		email={user?.email}
		avatarUrl={user?.avatarUrl}
		{initials}
		unreadCount={data.unreadCount}
		topBanner={impersonation}
		topBannerShown={data.impersonating}
	>
		{@render children()}
	</AdminShell>
{/if}
