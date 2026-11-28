<script lang="ts">
	import { Link2, Search } from 'lucide-svelte';
	import DataTable from '$dtss/DataTable.svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import StatusBadge from '$dtss/StatusBadge.svelte';
	import type { DataColumn } from '$dtss/tableState';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { affiliateTypeForRole } from '$lib/config/constants';
	import FormSelect from './FormSelect.svelte';
	import { payoutReadiness } from './people';

	export type AffiliateRow = {
		id: string;
		pid: number | string;
		name: string | null;
		email: string | null;
		role: string | null;
		code: string | null;
		status: string;
		statusSetManually?: boolean | null;
		statusReason?: string | null;
		commissionRateOverride?: string | number | null;
		connectPayoutsEnabled?: boolean | null;
		stripeConnectAccountId?: string | null;
	};

	let {
		affiliates,
		filters,
		programRate
	}: {
		affiliates: AffiliateRow[];
		filters: { q: string; status: string; role: string };
		programRate: string | number;
	} = $props();

	const filtered = $derived(Boolean(filters.q || filters.status || filters.role));

	const STATUS_OPTIONS = [
		{ value: '', label: 'Any status' },
		{ value: 'ACTIVE', label: 'Active' },
		{ value: 'ON_HOLD', label: 'On hold' },
		{ value: 'PENDING', label: 'Pending' },
		{ value: 'DENIED', label: 'Denied' }
	];
	const ROLE_OPTIONS = [
		{ value: '', label: 'Any type' },
		{ value: 'CLIENT', label: 'Practice' },
		{ value: 'CLIENT_STAFF', label: 'Practice staff' },
		{ value: 'CANDIDATE', label: 'Professional' },
		{ value: 'EXTERNAL_PARTNER', label: 'External partner' }
	];

	const columns: DataColumn<AffiliateRow>[] = [
		{ id: 'name', header: 'Affiliate', cell: nameCell },
		{ id: 'pid', header: '#', value: (a) => a.pid, numeric: true },
		{ id: 'type', header: 'Type', value: (a) => affiliateTypeForRole(a.role) },
		{ id: 'code', header: 'Code', cell: codeCell },
		{ id: 'status', header: 'Status', cell: statusCell },
		{ id: 'rate', header: 'Rate', cell: rateCell, numeric: true },
		{ id: 'payouts', header: 'Payouts', cell: payoutsCell }
	];
</script>

{#snippet nameCell(a: AffiliateRow)}
	<span class="block">{a.name ?? '—'}</span>
	<span class="block text-xs font-normal text-muted-foreground">{a.email}</span>
{/snippet}
{#snippet codeCell(a: AffiliateRow)}<code class="text-xs">{a.code ?? '—'}</code>{/snippet}
{#snippet statusCell(a: AffiliateRow)}
	<StatusBadge status={a.status} hint={a.statusReason ?? undefined} />
	{#if a.statusSetManually}<span class="mt-1 block text-caption text-muted-foreground">Set manually</span>{/if}
{/snippet}
{#snippet rateCell(a: AffiliateRow)}
	{#if a.commissionRateOverride}
		<span class="font-semibold">{a.commissionRateOverride}%</span>
		<span class="block text-caption text-muted-foreground">Override</span>
	{:else}
		<span class="text-muted-foreground">{programRate}%</span>
	{/if}
{/snippet}
{#snippet payoutsCell(a: AffiliateRow)}
	{@const p = payoutReadiness(a)}
	<StatusBadge status={p.status} label={p.label} />
{/snippet}

{#snippet mobile(a: AffiliateRow)}
	{@const p = payoutReadiness(a)}
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<p class="font-semibold">{a.name ?? '—'} <span class="font-normal text-muted-foreground">#{a.pid}</span></p>
			<p class="truncate text-sm text-muted-foreground">{a.email}</p>
			<p class="text-sm text-muted-foreground">
				{affiliateTypeForRole(a.role)} · {a.commissionRateOverride ? `${a.commissionRateOverride}% override` : `${programRate}%`} · Payouts: {p.label}
			</p>
		</div>
		<div class="shrink-0 whitespace-nowrap"><StatusBadge status={a.status} /></div>
	</div>
{/snippet}

{#snippet toolbar()}
	<!-- Plain GET form: filters live in the URL, so a filtered view is bookmarkable. -->
	<form method="GET" class="flex flex-wrap items-end gap-3" data-sveltekit-keepfocus role="search">
		<div class="grid min-w-[16rem] flex-1 gap-1.5">
			<Label for="aff-q">Search</Label>
			<div class="relative">
				<Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
				<Input id="aff-q" name="q" value={filters.q} placeholder="Name, email, organization, code or #id" class="pl-9" />
			</div>
		</div>
		<div class="grid w-40 gap-1.5">
			<Label for="aff-status">Status</Label>
			<FormSelect id="aff-status" name="status" value={filters.status} options={STATUS_OPTIONS} />
		</div>
		<div class="grid w-44 gap-1.5">
			<Label for="aff-role">Type</Label>
			<FormSelect id="aff-role" name="role" value={filters.role} options={ROLE_OPTIONS} />
		</div>
		<Button type="submit" variant="outline">Filter</Button>
		{#if filtered}<Button variant="ghost" href="/admin/menu/affiliates">Clear</Button>{/if}
	</form>
	<p class="mt-2 text-sm text-muted-foreground">
		{affiliates.length} affiliate{affiliates.length === 1 ? '' : 's'}{filtered ? ' matching' : ''}
	</p>
{/snippet}

{#snippet empty()}
	<EmptyState
		icon={Link2}
		title={filtered ? 'No affiliates match those filters' : 'No affiliates yet'}
		description={filtered ? 'Try another status or type, or clear the search.' : 'Practices and professionals appear here once they join the program.'}
	>
		{#if filtered}<Button variant="outline" href="/admin/menu/affiliates">Clear filters</Button>{/if}
	</EmptyState>
{/snippet}

<DataTable
	rows={affiliates}
	{columns}
	key={(a) => a.id}
	caption="Affiliates"
	rowHref={(a) => `/admin/menu/affiliates/${a.id}`}
	rowLabel={(a) => `Manage ${a.name ?? a.email ?? `affiliate #${a.pid}`}`}
	{toolbar}
	{empty}
	{mobile}
/>
