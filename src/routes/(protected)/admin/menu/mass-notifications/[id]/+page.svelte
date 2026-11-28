<script lang="ts">
	import Page from '$dtss/Page.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';
	import { CampaignActions, CampaignDetail } from '$features/admin';

	let { data } = $props();
</script>

<Page>
	<PageHeader title={data.campaign.name} description="Mass notification">
		{#snippet actions()}<CampaignActions campaign={data.campaign} />{/snippet}
	</PageHeader>
	<CampaignDetail campaign={data.campaign} recipients={data.recipients} />
</Page>
