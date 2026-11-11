<script lang="ts">
	import Page from '$dtss/Page.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';
	import { ExportList } from '$features/admin';

	let { data } = $props();
</script>

<svelte:head><title>Exports | Admin</title></svelte:head>

<Page width="narrow">
	<PageHeader
		title="Exports"
		description="CSV downloads for bookkeeping and reporting. Money columns are plain decimals so they stay numeric in a spreadsheet."
	/>
	<ExportList groups={data.groups} />
</Page>
