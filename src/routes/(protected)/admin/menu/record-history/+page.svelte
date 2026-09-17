<script lang="ts">
	import * as Table from '$lib/components/ui/table';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import type { PageData } from './$types';
	import { Search, ChevronLeft, ChevronRight, History, Eye, X } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { format } from 'date-fns';
	import {
		AUDIT_ACTIONS,
		AUDIT_ENTITY_TYPES,
		AUDIT_SOURCES,
		ACTION_LABELS,
		ENTITY_LABELS,
		SOURCE_LABELS,
		type ActivityEntry
	} from '$lib/audit/constants';
	import ActivityLog from '$lib/components/audit/ActivityLog.svelte';

	export let data: PageData;

	const ROLES = ['SUPERADMIN', 'CLIENT', 'CLIENT_STAFF', 'CANDIDATE'] as const;
	const ROLE_LABELS: Record<string, string> = {
		SUPERADMIN: 'Admin',
		CLIENT: 'Client',
		CLIENT_STAFF: 'Client staff',
		CANDIDATE: 'Professional'
	};

	// Local copies of the URL-driven filters so typing doesn't navigate on every key.
	let search = data.filters.search;
	let startDate = data.filters.startDate;
	let endDate = data.filters.endDate;
	let entityType = data.filters.entityType;
	let action = data.filters.action;
	let role = data.filters.role;
	let source = data.filters.source;

	$: rows = data.rows as ActivityEntry[];
	$: totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
	$: hasFilters = !!(search || startDate || endDate || entityType || action || role || source);

	let selected: ActivityEntry | null = null;
	let detailsOpen = false;

	function buildUrl(page = 1) {
		const params = new URLSearchParams();
		if (search) params.set('search', search);
		if (startDate) params.set('startDate', startDate);
		if (endDate) params.set('endDate', endDate);
		if (entityType) params.set('entityType', entityType);
		if (action) params.set('action', action);
		if (role) params.set('role', role);
		if (source) params.set('source', source);
		if (page > 1) params.set('page', String(page));
		if (data.pageSize !== 50) params.set('pageSize', String(data.pageSize));
		const qs = params.toString();
		return qs ? `/admin/menu/record-history?${qs}` : '/admin/menu/record-history';
	}
	function applyFilters() {
		goto(buildUrl(1));
	}
	function clearFilters() {
		search = startDate = endDate = entityType = action = role = source = '';
		goto('/admin/menu/record-history');
	}
	function goPage(page: number) {
		goto(buildUrl(page));
	}
	function viewDetails(record: ActivityEntry) {
		selected = record;
		detailsOpen = true;
	}

	function actionBadgeClass(a: string) {
		switch (a) {
			case 'VIEW':
			case 'DOWNLOAD':
				return 'bg-slate-100 text-slate-700 hover:bg-slate-100';
			case 'CREATE':
			case 'APPROVE':
			case 'CLAIM':
			case 'ASSIGN':
			case 'PAYMENT_RECORDED':
				return 'bg-green-100 text-green-800 hover:bg-green-100';
			case 'DELETE':
			case 'REJECT':
			case 'VOID':
			case 'CANCEL':
			case 'BLACKLIST':
			case 'PAYMENT_REVERSED':
				return 'bg-red-100 text-red-800 hover:bg-red-100';
			case 'EMAIL_SENT':
				return 'bg-violet-100 text-violet-800 hover:bg-violet-100';
			case 'IMPERSONATE_START':
			case 'IMPERSONATE_STOP':
				return 'bg-amber-100 text-amber-900 hover:bg-amber-100';
			default:
				return 'bg-blue-100 text-blue-800 hover:bg-blue-100';
		}
	}
	function entityLabel(t: string) {
		return ENTITY_LABELS[t as keyof typeof ENTITY_LABELS] ?? t.toLowerCase().replace(/_/g, ' ');
	}
	function actionLabel(a: string) {
		return ACTION_LABELS[a as keyof typeof ACTION_LABELS] ?? a.toLowerCase().replace(/_/g, ' ');
	}
	function sourceLabel(s: string | null) {
		if (!s) return 'Legacy';
		return SOURCE_LABELS[s as keyof typeof SOURCE_LABELS] ?? s;
	}

	const selectClass =
		'flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';
</script>

<section class="flex h-full flex-col space-y-6 p-6">
	<div class="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Record History</h1>
			<p class="text-muted-foreground">
				The platform ledger: every view and action, who did it, when, and from where.
			</p>
		</div>
	</div>

	<!-- Filters -->
	<div class="space-y-4 rounded-lg bg-white p-4 shadow-sm">
		<div class="grid grid-cols-1 gap-4 md:grid-cols-4">
			<div class="md:col-span-2">
				<Label for="search">Search</Label>
				<Input
					id="search"
					bind:value={search}
					placeholder="Name, email, entity ID, IP address…"
					class="bg-white"
					on:keypress={(e) => e.key === 'Enter' && applyFilters()}
				/>
			</div>
			<div>
				<Label for="startDate">From</Label>
				<Input id="startDate" type="date" bind:value={startDate} class="bg-white" />
			</div>
			<div>
				<Label for="endDate">To</Label>
				<Input id="endDate" type="date" bind:value={endDate} class="bg-white" />
			</div>
			<div>
				<Label for="entityType">Entity</Label>
				<select id="entityType" class={selectClass} bind:value={entityType}>
					<option value="">All entities</option>
					{#each AUDIT_ENTITY_TYPES as t}
						<option value={t}>{entityLabel(t)}</option>
					{/each}
				</select>
			</div>
			<div>
				<Label for="action">Action</Label>
				<select id="action" class={selectClass} bind:value={action}>
					<option value="">All actions</option>
					{#each AUDIT_ACTIONS as a}
						<option value={a}>{a}</option>
					{/each}
				</select>
			</div>
			<div>
				<Label for="role">Actor role</Label>
				<select id="role" class={selectClass} bind:value={role}>
					<option value="">All roles</option>
					{#each ROLES as r}
						<option value={r}>{ROLE_LABELS[r]}</option>
					{/each}
				</select>
			</div>
			<div>
				<Label for="source">Source</Label>
				<select id="source" class={selectClass} bind:value={source}>
					<option value="">All sources</option>
					{#each AUDIT_SOURCES as s}
						<option value={s}>{SOURCE_LABELS[s]}</option>
					{/each}
				</select>
			</div>
		</div>
		<div class="flex gap-2">
			<Button size="sm" class="bg-primary hover:bg-primary/90" on:click={applyFilters}>
				<Search class="mr-2 h-4 w-4" />
				Apply
			</Button>
			{#if hasFilters}
				<Button size="sm" variant="outline" on:click={clearFilters}>
					<X class="mr-2 h-4 w-4" />
					Clear
				</Button>
			{/if}
		</div>
	</div>

	<!-- Table -->
	<div class="flex flex-1 flex-col rounded-lg bg-white shadow-sm">
		{#if rows.length > 0}
			<div class="flex-1 overflow-auto rounded-md border">
				<Table.Root>
					<Table.Header>
						<Table.Row class="bg-white">
							<Table.Head>When</Table.Head>
							<Table.Head>Who</Table.Head>
							<Table.Head>Action</Table.Head>
							<Table.Head>Entity</Table.Head>
							<Table.Head>Source</Table.Head>
							<Table.Head>IP</Table.Head>
							<Table.Head></Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each rows as row (row.id)}
							<Table.Row class="bg-gray-50 transition-colors hover:bg-gray-100">
								<Table.Cell class="whitespace-nowrap text-sm">
									{format(row.createdAt, 'PP')}
									<span class="text-muted-foreground">{format(row.createdAt, 'pp')}</span>
								</Table.Cell>
								<Table.Cell class="text-sm">
									<div class="font-medium">
										{row.actorName ?? (row.userId ? 'Deleted user' : 'System')}
									</div>
									<div class="text-xs text-muted-foreground">
										{#if row.actorRole}{ROLE_LABELS[row.actorRole] ?? row.actorRole}{/if}
										{#if row.actorEmail}· {row.actorEmail}{/if}
									</div>
									{#if row.impersonatedBy}
										<Badge
											variant="destructive"
											class="mt-1 px-1.5 py-0 text-[10px] font-normal"
											value={`impersonated by ${row.impersonatorName ?? row.impersonatedBy}`}
										/>
									{/if}
								</Table.Cell>
								<Table.Cell>
									<Badge class={actionBadgeClass(row.action)} value={row.action} />
								</Table.Cell>
								<Table.Cell class="text-sm">
									<div class="capitalize">{entityLabel(row.entityType)}</div>
									<div class="font-mono text-xs text-muted-foreground">
										{row.entityId.length > 18 ? `${row.entityId.slice(0, 18)}…` : row.entityId}
									</div>
								</Table.Cell>
								<Table.Cell class="text-sm">{sourceLabel(row.source)}</Table.Cell>
								<Table.Cell class="font-mono text-xs">{row.ipAddress ?? '—'}</Table.Cell>
								<Table.Cell>
									<Button
										type="button"
										variant="outline"
										size="sm"
										on:click={() => viewDetails(row)}
										title="View details"
									>
										<Eye size={16} />
									</Button>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>

			<!-- Pagination -->
			<div class="flex items-center justify-between space-x-2 border-t p-4">
				<div class="flex-1 text-sm text-muted-foreground">
					Showing {(data.page - 1) * data.pageSize + 1}–{Math.min(
						data.page * data.pageSize,
						data.total
					)} of {data.total} records
				</div>
				<div class="flex items-center space-x-2">
					<Button
						variant="outline"
						size="sm"
						on:click={() => goPage(data.page - 1)}
						disabled={data.page <= 1}
					>
						<ChevronLeft class="h-4 w-4" />
						Previous
					</Button>
					<span class="text-sm text-muted-foreground">Page {data.page} of {totalPages}</span>
					<Button
						variant="outline"
						size="sm"
						on:click={() => goPage(data.page + 1)}
						disabled={data.page >= totalPages}
					>
						Next
						<ChevronRight class="h-4 w-4" />
					</Button>
				</div>
			</div>
		{:else}
			<div class="flex flex-1 flex-col items-center justify-center py-12 text-center">
				<div class="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
					<History class="h-8 w-8 text-gray-400" />
				</div>
				<h3 class="mb-2 text-lg font-medium text-gray-900">No records found</h3>
				<p class="text-sm text-gray-500">
					{#if hasFilters}
						Try adjusting your filters
					{:else}
						No actions have been recorded yet
					{/if}
				</p>
			</div>
		{/if}
	</div>
</section>

<Dialog.Root bind:open={detailsOpen}>
	<Dialog.Content class="max-h-[85vh] max-w-3xl overflow-y-auto">
		<Dialog.Header>
			<Dialog.Title>Ledger entry</Dialog.Title>
			<Dialog.Description>
				{#if selected}
					{actionLabel(selected.action)} · {entityLabel(selected.entityType)}
				{/if}
			</Dialog.Description>
		</Dialog.Header>
		{#if selected}
			<ActivityLog entries={[selected]} showEntity />
		{/if}
		<Dialog.Footer>
			<Button variant="outline" on:click={() => (detailsOpen = false)}>Close</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
