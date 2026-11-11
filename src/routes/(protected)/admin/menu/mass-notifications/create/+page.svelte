<script lang="ts">
	import Page from '$dtss/Page.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';
	import { MassNotificationForm } from '$features/admin';

	let { data } = $props();
</script>

<Page>
	<PageHeader
		title="New mass notification"
		description="Pick an audience and filters, preview who it reaches, then queue the send."
	/>
	<MassNotificationForm {data} />
</Page>
