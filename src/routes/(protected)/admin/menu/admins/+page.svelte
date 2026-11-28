<script lang="ts">
	import { page } from '$app/state';
	import Page from '$dtss/Page.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';
	import { AdminsTable, InviteAdminDialog } from '$features/admin';

	let { data } = $props();
</script>

<Page>
	<PageHeader title="Admins" description="The people who run DTSS, as admins or super admins. Open one to edit their details or role.">
		{#snippet actions()}<InviteAdminDialog form={data.form} />{/snippet}
	</PageHeader>
	<AdminsTable admins={data.admins} search={page.url.searchParams.get('search') ?? ''} />
</Page>
