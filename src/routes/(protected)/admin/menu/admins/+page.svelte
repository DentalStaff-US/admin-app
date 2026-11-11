<script lang="ts">
	import { page } from '$app/state';
	import Page from '$dtss/Page.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';
	import { AdminsTable, InviteAdminDialog } from '$features/admin';

	let { data } = $props();
</script>

<Page>
	<PageHeader title="Admins" description="The people who run DTSS. Open one to edit their details.">
		{#snippet actions()}<InviteAdminDialog form={data.form} />{/snippet}
	</PageHeader>
	<AdminsTable admins={data.admins} search={page.url.searchParams.get('search') ?? ''} />
</Page>
