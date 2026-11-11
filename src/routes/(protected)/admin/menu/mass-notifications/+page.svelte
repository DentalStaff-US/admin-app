<script lang="ts">
	import Page from '$dtss/Page.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';
	import { Button } from '$lib/components/ui/button';
	import { CampaignTable } from '$features/admin';

	let { data } = $props();
</script>

<Page>
	<PageHeader
		title="Mass notifications"
		description="Targeted SMS and email campaigns to professionals and practices."
	>
		{#snippet actions()}<Button href="/admin/menu/mass-notifications/create">New mass notification</Button>{/snippet}
	</PageHeader>
	<CampaignTable campaigns={data.campaigns} />
</Page>
