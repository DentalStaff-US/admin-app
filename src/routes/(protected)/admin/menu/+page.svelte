<script lang="ts">
	import Page from '$dtss/Page.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';
	import { ADMIN_MENU_ITEMS, AdminMenuGrid } from '$features/admin';
</script>

<Page>
	<PageHeader title="Admin" description="Tools for running the platform: people, billing, communication, data and system settings." />
	<AdminMenuGrid items={ADMIN_MENU_ITEMS} />
</Page>
