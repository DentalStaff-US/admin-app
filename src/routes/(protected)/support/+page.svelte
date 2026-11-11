<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { pageHrefFor, readPage, withParam } from '$dtss/tableState';
	import { USER_ROLES } from '$lib/config/constants';
	import { SupportListPage } from '$features/support';

	let { data } = $props();

	const isAdmin = $derived(data.user?.role === USER_ROLES.SUPERADMIN);
	const search = $derived(page.url.searchParams.get('search') ?? '');

	function onSearch(term: string) {
		goto(withParam(page.url, 'search', term), { replaceState: true, keepFocus: true, noScroll: true });
	}
</script>

<SupportListPage
	tickets={(data.tickets ?? []) as any}
	form={data.form}
	{isAdmin}
	{search}
	page={readPage(page.url)}
	pageHref={(p) => pageHrefFor(page.url, p)}
	{onSearch}
/>
