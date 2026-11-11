<script lang="ts">
	import { checkIsAdmin } from '$lib/_helpers/checkIsAdmin';
	import { page } from '$app/stores';
	import { Plus, Workflow } from 'lucide-svelte';
	import Notice from '$dtss/Notice.svelte';
	import Page from '$dtss/Page.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';
	import AddRequisitionDrawer from '$lib/components/drawers/addRequisitionDrawer.svelte';
	import { Button } from '$lib/components/ui/button';
	import { USER_ROLES } from '$lib/config/constants';
	import type { AdminRequisitionSchema, ClientRequisitionSchema } from '$lib/config/zod-schemas';
	import { withParam } from '$dtss/tableState';
	import { RequestsTable } from '$features/requisitions';
	import type { SuperValidated } from 'sveltekit-superforms';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let drawerExpanded = $state(false);
	const isAdmin = $derived(checkIsAdmin(data.user?.role));
	const noun = 'requisition';
	const clientForm = $derived(data.clientForm as SuperValidated<ClientRequisitionSchema> | null);
	const adminForm = $derived(data.adminForm as SuperValidated<AdminRequisitionSchema> | null);
</script>

<Page>
	<PageHeader
		title="Requisitions"
		description={isAdmin
			? 'Every temp and permanent requisition across practices.'
			: 'Temp shifts and permanent positions across your locations.'}
	>
		{#snippet actions()}
			{#if isAdmin}
				<Button variant="outline" href="/requisitions/permanent" class="gap-2">
					<Workflow class="size-4" aria-hidden="true" /> Permanent pipeline
				</Button>
			{/if}
			{#if data.canCreateRequisitions}
				<Button on:click={() => (drawerExpanded = true)} class="gap-2">
					<Plus class="size-4" aria-hidden="true" /> New {noun}
				</Button>
			{/if}
		{/snippet}
	</PageHeader>

	{#if !isAdmin && data.clientStatus && !data.canCreateRequisitions}
		{#if data.billingBlockedMessage && data.clientStatus === 'ACTIVE'}
			<Notice tone="warning" title="Billing setup required">
				{data.billingBlockedMessage}
				<a href="/settings?tab=BILLING&role=CLIENT" class="ml-1 font-semibold underline">Go to billing settings</a>
			</Notice>
		{:else if data.clientStatus === 'PENDING'}
			<Notice tone="pending" title="Pending approval">
				You'll be able to post requisitions once our team approves your account.
			</Notice>
		{:else if data.clientStatus === 'DENIED'}
			<Notice tone="negative" title="Account denied">
				Please contact support if you believe this is a mistake.
			</Notice>
		{:else}
			<Notice tone="warning" title="Account inactive">
				Posting is paused. Contact support to reactivate.
			</Notice>
		{/if}
	{:else if data.filter === 'unbilled'}
		<Notice tone="warning" title="Unbilled placements">
			Showing {data.list.total} permanent placement{data.list.total === 1 ? '' : 's'} that were filled but have no live invoice yet.
			<a href={withParam(new URL($page.url), 'filter', null)} class="ml-1 font-semibold underline">Clear filter</a>
		</Notice>
	{/if}

	<RequestsTable
		url={$page.url}
		rows={data.list.rows}
		total={data.list.total}
		page={data.list.page}
		pageSize={data.list.pageSize}
		tab={data.list.tab}
		counts={data.list.counts}
		sort={data.list.sort}
		facets={data.list.facets}
		{isAdmin}
		{noun}
		searchTerm={data.searchTerm}
	/>
</Page>

<AddRequisitionDrawer user={data.user} bind:drawerExpanded {clientForm} {adminForm} />
