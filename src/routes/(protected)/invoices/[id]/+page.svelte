<script lang="ts">
	import { FileX } from 'lucide-svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import Page from '$dtss/Page.svelte';
	import { Button } from '$lib/components/ui/button';
	import { USER_ROLES } from '$lib/config/constants';
	import { InvoiceDetail } from '$features/invoices';

	let { data } = $props();
</script>

<svelte:head>
	<title>{data.invoice ? `Invoice #${data.invoice.invoice.invoiceNumber}` : 'Invoice'} | DTSS</title>
</svelte:head>

{#if data.invoice}
	<InvoiceDetail data={data as any} isAdmin={data.user?.role === USER_ROLES.SUPERADMIN} />
{:else}
	<!-- The load returns no invoice when it isn't yours (or doesn't exist). -->
	<Page width="narrow">
		<EmptyState icon={FileX} title="Invoice not found" description="It may have been removed, or it belongs to another account.">
			<Button variant="outline" href="/invoices">Back to invoices</Button>
		</EmptyState>
	</Page>
{/if}
