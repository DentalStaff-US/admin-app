<script lang="ts">
	import Page from '$dtss/Page.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';
	import type { ActivityEntry } from '$lib/audit/constants';
	import { RecordHistoryTable } from '$features/admin';

	let { data } = $props();
</script>

<Page width="full">
	<PageHeader
		title="Record history"
		description="The platform ledger: every view and action, who did it, when, and from where."
	/>
	<RecordHistoryTable
		rows={data.rows as ActivityEntry[]}
		total={data.total}
		page={data.page}
		pageSize={data.pageSize}
		filters={data.filters}
	/>
</Page>
