<script lang="ts">
	import Page from '$dtss/Page.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';
	import { page } from '$app/state';
	import { ADMIN_MENU_ITEMS, AdminMenuGrid, adminMenuFor } from '$features/admin';

	// Only the tools this admin's role can use (ADMIN sees fewer than SUPERADMIN).
	const items = $derived(adminMenuFor(ADMIN_MENU_ITEMS, page.data.user));
</script>

<Page>
	<PageHeader title="Admin" description="Tools for running the platform: people, billing, communication, data and system settings." />
	<AdminMenuGrid {items} />
</Page>
