<script lang="ts">
	import Page from '$dtss/Page.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';
	import { ConversationLogTable } from '$features/inbox';

	let { data } = $props();
</script>

<Page width="full">
	<PageHeader
		title="Conversation log"
		description="Every message thread with practices and professionals, read-only. Opening one is recorded in the record history, and nobody in it is notified."
	/>
	<ConversationLogTable rows={data.rows} total={data.total} page={data.page} pageSize={data.pageSize} filters={data.filters} />
</Page>
