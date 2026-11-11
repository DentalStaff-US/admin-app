<script lang="ts">
	import { page } from '$app/state';
	import Page from '$dtss/Page.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';
	import { CalendarPage } from '$features/calendar';

	let { data } = $props();
</script>

<Page width="full">
	<PageHeader title="Calendar" description="Every scheduled shift, coloured by status. Hover for details; click to open." />
	<CalendarPage events={(data.events ?? []) as any[]} url={page.url} />
</Page>
