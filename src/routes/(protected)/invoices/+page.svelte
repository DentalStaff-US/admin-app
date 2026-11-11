<script lang="ts">
	import { page } from '$app/state';
	import { InvoicesListPage } from '$features/invoices';

	let { data } = $props();
</script>

<svelte:head>
	<title>Invoices | DTSS</title>
</svelte:head>

<InvoicesListPage list={data.list} query={data.query} search={data.searchTerm} isAdmin={data.isAdmin} url={page.url} />
