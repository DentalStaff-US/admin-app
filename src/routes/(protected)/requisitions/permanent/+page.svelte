<script lang="ts">
	import { page } from '$app/stores';
	import { PermanentPipelinePage } from '$features/requisitions';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<PermanentPipelinePage
	url={$page.url}
	tab={data.tab}
	view={data.view === 'board' ? 'board' : 'table'}
	rows={data.rows}
	tabCounts={data.tabCounts}
	facets={data.facets}
/>
