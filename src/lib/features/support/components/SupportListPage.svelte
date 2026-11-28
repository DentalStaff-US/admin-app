<script lang="ts">
	import { LifeBuoy, Plus, Search } from 'lucide-svelte';
	import { format } from 'date-fns';
	import DataTable from '$dtss/DataTable.svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import Page from '$dtss/Page.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';
	import StatusBadge from '$dtss/StatusBadge.svelte';
	import type { DataColumn } from '$dtss/tableState';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { fullName, pageOf, supportRoleLabel } from '../support';
	import NewTicketDialog from './NewTicketDialog.svelte';

	type Ticket = {
		supportTicket: { id: string; ticketNumber?: number | null; title: string; status: string | null; createdAt: Date | string; updatedAt: Date | string };
		reportedBy?: { firstName?: string | null; lastName?: string | null; role?: string | null } | null;
	};

	let {
		tickets,
		form,
		isAdmin,
		search = '',
		page = 1,
		pageSize = 20,
		pageHref,
		onSearch
	}: {
		tickets: Ticket[];
		form: any;
		isAdmin: boolean;
		search?: string;
		page?: number;
		pageSize?: number;
		pageHref: (page: number) => string;
		/** Debounced; the route puts it in the URL. */
		onSearch?: (term: string) => void;
	} = $props();

	let open = $state(false);
	// svelte-ignore state_referenced_locally
	let term = $state(search);
	let timer: ReturnType<typeof setTimeout> | undefined;

	function onInput() {
		clearTimeout(timer);
		timer = setTimeout(() => onSearch?.(term.trim()), 300);
	}

	const rows = $derived(pageOf(tickets, page, pageSize));
	const ticketLabel = (t: Ticket) => `#${t.supportTicket.ticketNumber ?? ''} ${t.supportTicket.title}`;
	const when = (d: Date | string) => format(new Date(d), 'MMM d, yyyy');

	const columns: DataColumn<Ticket>[] = $derived([
		{ id: 'ticket', header: 'Ticket', cell: ticketCell },
		...(isAdmin ? [{ id: 'reporter', header: 'Opened by', cell: reporterCell } satisfies DataColumn<Ticket>] : []),
		{ id: 'status', header: 'Status', cell: statusCell },
		{ id: 'created', header: 'Opened', value: (t) => when(t.supportTicket.createdAt) },
		{ id: 'updated', header: 'Last activity', value: (t) => when(t.supportTicket.updatedAt) }
	]);
</script>

{#snippet ticketCell(t: Ticket)}
	<span class="tabular-nums text-muted-foreground">#{t.supportTicket.ticketNumber ?? ''}</span>
	<span class="ml-1">{t.supportTicket.title}</span>
{/snippet}
{#snippet reporterCell(t: Ticket)}
	<span class="block font-semibold">{fullName(t.reportedBy)}</span>
	<span class="block text-xs text-muted-foreground">{supportRoleLabel(t.reportedBy?.role)}</span>
{/snippet}
{#snippet statusCell(t: Ticket)}<StatusBadge status={t.supportTicket.status} />{/snippet}
{#snippet mobile(t: Ticket)}
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<p class="truncate font-semibold">{t.supportTicket.title}</p>
			<p class="text-sm text-muted-foreground">
				#{t.supportTicket.ticketNumber ?? ''} · {isAdmin ? `${fullName(t.reportedBy)} · ` : ''}{when(t.supportTicket.updatedAt)}
			</p>
		</div>
		<StatusBadge status={t.supportTicket.status} />
	</div>
{/snippet}
{#snippet toolbar()}
	<div class="relative max-w-sm">
		<Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
		<Input type="search" placeholder={isAdmin ? 'Search by subject or name' : 'Search by subject'} aria-label="Search tickets" class="pl-9" bind:value={term} on:input={onInput} />
	</div>
{/snippet}
{#snippet empty()}
	{#if search}
		<p class="py-8 text-center text-sm text-muted-foreground">
			No tickets match “{search}”.
			<button type="button" class="font-semibold text-primary-dark hover:underline" onclick={() => { term = ''; onSearch?.(''); }}>Clear search</button>
		</p>
	{:else if isAdmin}
		<EmptyState icon={LifeBuoy} title="No support tickets" description="Tickets from practices and professionals show up here." />
	{:else}
		<EmptyState icon={LifeBuoy} title="No tickets yet" description="If something isn't working, tell us here and our team will reply on the ticket.">
			<Button on:click={() => (open = true)}><Plus class="mr-2 size-4" aria-hidden="true" /> New ticket</Button>
		</EmptyState>
	{/if}
{/snippet}

<Page>
	<PageHeader title="Support" description={isAdmin ? 'Tickets from practices and professionals.' : 'Ask our team for help and follow the conversation here.'}>
		{#snippet actions()}
			<Button on:click={() => (open = true)}><Plus class="mr-2 size-4" aria-hidden="true" /> New ticket</Button>
		{/snippet}
	</PageHeader>

	<DataTable
		{rows}
		{columns}
		key={(t) => t.supportTicket.id}
		rowHref={(t) => `/support/ticket/${t.supportTicket.id}`}
		rowLabel={ticketLabel}
		caption="Support tickets"
		pagination={tickets.length > pageSize ? { page, pageSize, total: tickets.length, href: pageHref } : undefined}
		{toolbar}
		{mobile}
		{empty}
	/>
</Page>

<NewTicketDialog bind:open {form} />
