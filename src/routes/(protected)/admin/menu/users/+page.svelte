<script lang="ts">
	import { page } from '$app/state';
	import Page from '$dtss/Page.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';
	import { pageHrefFor } from '$dtss/tableState';
	import { UsersTable } from '$features/admin';

	let { data } = $props();
</script>

<Page>
	<PageHeader title="All users" description="Search, inspect, suspend and remove users across every role." />
	<UsersTable
		users={data.users}
		total={data.total ?? 0}
		page={data.page ?? 1}
		limit={data.limit ?? 25}
		search={data.search ?? ''}
		currentUserId={data.user?.id}
		pageHref={(p) => pageHrefFor(page.url, p)}
	/>
</Page>
