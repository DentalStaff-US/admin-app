<script lang="ts">
	import { page } from '$app/state';
	import { TimesheetsListPage } from '$features/timesheets';

	let { data } = $props();
</script>

<svelte:head>
	<title>Timesheets | DTSS</title>
</svelte:head>

<TimesheetsListPage list={data.list} query={data.query} search={data.searchTerm} isAdmin={data.isAdmin} url={page.url} />
