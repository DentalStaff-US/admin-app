<script lang="ts">
	import { goto } from '$app/navigation';
	import { format } from 'date-fns';
	import { Eye, History, Search, X } from 'lucide-svelte';
	import DataTable from '$dtss/DataTable.svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import type { DataColumn } from '$dtss/tableState';
	import { TONE_CLASSES } from '$tokens/status';
	import ActivityLog from '$lib/components/audit/ActivityLog.svelte';
	import { auditActionTone } from '$lib/components/audit/auditTone';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { cn } from '$lib/utils';
	import {
		AUDIT_ACTIONS,
		AUDIT_ENTITY_TYPES,
		AUDIT_SOURCES,
		ACTION_LABELS,
		ENTITY_LABELS,
		SOURCE_LABELS,
		type ActivityEntry
	} from '$lib/audit/constants';
	import SelectField from './SelectField.svelte';
	import { hasRecordHistoryFilters, recordHistoryUrl, shortId, type RecordHistoryFilters } from './comms';

	let {
		rows,
		total,
		page,
		pageSize,
		filters
	}: {
		rows: ActivityEntry[];
		total: number;
		page: number;
		pageSize: number;
		/** The filters the current rows were loaded with (from the URL). */
		filters: RecordHistoryFilters;
	} = $props();

	const ROLE_LABELS: Record<string, string> = {
		SUPERADMIN: 'Admin',
		ADMIN: 'Admin',
		CLIENT: 'Client',
		CLIENT_STAFF: 'Client staff',
		CANDIDATE: 'Professional'
	};

	// Local copies so typing doesn't navigate on every key; Apply puts them in the URL.
	// svelte-ignore state_referenced_locally
	let draft = $state<RecordHistoryFilters>({ ...filters });
	$effect(() => {
		draft = { ...filters };
	});

	let selected = $state<ActivityEntry | null>(null);
	let detailsOpen = $state(false);

	const applied = $derived(hasRecordHistoryFilters(filters));

	const entityLabel = (t: string) =>
		ENTITY_LABELS[t as keyof typeof ENTITY_LABELS] ?? t.toLowerCase().replace(/_/g, ' ');
	const actionLabel = (a: string) =>
		ACTION_LABELS[a as keyof typeof ACTION_LABELS] ?? a.toLowerCase().replace(/_/g, ' ');
	const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
	const sourceLabel = (s: string | null) =>
		!s ? 'Legacy' : (SOURCE_LABELS[s as keyof typeof SOURCE_LABELS] ?? s);
	const actorName = (r: ActivityEntry) => r.actorName ?? (r.userId ? 'Deleted user' : 'System');

	const entityOptions = [{ value: '', label: 'All entities' }, ...AUDIT_ENTITY_TYPES.map((t) => ({ value: t, label: entityLabel(t) }))];
	const actionOptions = [{ value: '', label: 'All actions' }, ...AUDIT_ACTIONS.map((a) => ({ value: a, label: capitalize(actionLabel(a)) }))];
	const roleOptions = [{ value: '', label: 'All roles' }, ...Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }))];
	const sourceOptions = [{ value: '', label: 'All sources' }, ...AUDIT_SOURCES.map((s) => ({ value: s, label: SOURCE_LABELS[s] }))];

	function apply(event?: SubmitEvent) {
		event?.preventDefault();
		goto(recordHistoryUrl(draft, 1, pageSize));
	}
	function clear() {
		goto(recordHistoryUrl({ search: '', startDate: '', endDate: '', entityType: '', action: '', role: '', source: '' }));
	}
	function view(record: ActivityEntry) {
		selected = record;
		detailsOpen = true;
	}

	const columns: DataColumn<ActivityEntry>[] = [
		{ id: 'when', header: 'When', cell: when, class: 'whitespace-nowrap' },
		{ id: 'who', header: 'Who', cell: who },
		{ id: 'action', header: 'Action', cell: actionCell },
		{ id: 'entity', header: 'Entity', cell: entity },
		{ id: 'source', header: 'Source', value: (r) => sourceLabel(r.source) },
		{ id: 'ip', header: 'IP', value: (r) => r.ipAddress ?? '—', class: 'font-mono text-xs' },
		{ id: 'details', header: 'Details', srOnlyHeader: true, cell: details, class: 'text-right' }
	];
</script>

{#snippet when(r: ActivityEntry)}
	{format(r.createdAt, 'PP')} <span class="text-muted-foreground">{format(r.createdAt, 'p')}</span>
{/snippet}

{#snippet who(r: ActivityEntry)}
	<div class="font-semibold">{actorName(r)}</div>
	<div class="text-xs text-muted-foreground">
		{#if r.actorRole}{ROLE_LABELS[r.actorRole] ?? r.actorRole}{/if}
		{#if r.actorEmail}· {r.actorEmail}{/if}
	</div>
	{#if r.impersonatedBy}
		<span class={cn('mt-1 inline-block rounded-full border px-2 text-xs font-semibold', TONE_CLASSES.warning)}>
			Impersonated by {r.impersonatorName ?? r.impersonatedBy}
		</span>
	{/if}
{/snippet}

{#snippet actionCell(r: ActivityEntry)}
	<span class={cn('inline-flex rounded-full border px-2.5 py-0.5 text-xs font-bold', TONE_CLASSES[auditActionTone(r.action)])}>
		{capitalize(actionLabel(r.action))}
	</span>
{/snippet}

{#snippet entity(r: ActivityEntry)}
	<div class="capitalize">{entityLabel(r.entityType)}</div>
	<div class="font-mono text-xs text-muted-foreground">{shortId(r.entityId)}</div>
{/snippet}

{#snippet details(r: ActivityEntry)}
	<Button type="button" variant="ghost" size="icon" on:click={() => view(r)} aria-label={`Details of ${actorName(r)} ${actionLabel(r.action)}`}>
		<Eye class="size-4" aria-hidden="true" />
	</Button>
{/snippet}

{#snippet mobile(r: ActivityEntry)}
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0 text-sm">
			<p><b class="font-bold">{actorName(r)}</b> {actionLabel(r.action)} {entityLabel(r.entityType)}</p>
			<p class="text-caption text-muted-foreground">
				{format(r.createdAt, 'PPp')} · {sourceLabel(r.source)}{r.ipAddress ? ` · ${r.ipAddress}` : ''}
			</p>
		</div>
		{@render details(r)}
	</div>
{/snippet}

{#snippet toolbar()}
	<form class="space-y-4" onsubmit={apply}>
		<div class="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
			<div class="col-span-2 space-y-2">
				<Label for="rh-search">Search</Label>
				<Input id="rh-search" type="search" bind:value={draft.search} placeholder="Name, email, entity ID, IP address…" />
			</div>
			<div class="space-y-2">
				<Label for="rh-from">From</Label>
				<Input id="rh-from" type="date" bind:value={draft.startDate} />
			</div>
			<div class="space-y-2">
				<Label for="rh-to">To</Label>
				<Input id="rh-to" type="date" bind:value={draft.endDate} />
			</div>
			<div class="space-y-2">
				<Label for="rh-entity">Entity</Label>
				<SelectField id="rh-entity" bind:value={draft.entityType} options={entityOptions} placeholder="All entities" />
			</div>
			<div class="space-y-2">
				<Label for="rh-action">Action</Label>
				<SelectField id="rh-action" bind:value={draft.action} options={actionOptions} placeholder="All actions" />
			</div>
			<div class="space-y-2">
				<Label for="rh-role">Actor role</Label>
				<SelectField id="rh-role" bind:value={draft.role} options={roleOptions} placeholder="All roles" />
			</div>
			<div class="space-y-2">
				<Label for="rh-source">Source</Label>
				<SelectField id="rh-source" bind:value={draft.source} options={sourceOptions} placeholder="All sources" />
			</div>
		</div>
		<div class="flex flex-wrap gap-2">
			<Button type="submit" size="sm"><Search class="mr-2 size-4" aria-hidden="true" /> Apply filters</Button>
			{#if applied}
				<Button type="button" size="sm" variant="outline" on:click={clear}><X class="mr-2 size-4" aria-hidden="true" /> Clear</Button>
			{/if}
		</div>
	</form>
{/snippet}

{#snippet empty()}
	{#if applied}
		<EmptyState icon={History} title="No records match these filters" description="Try a wider date range or fewer filters.">
			<Button variant="outline" on:click={clear}>Clear filters</Button>
		</EmptyState>
	{:else}
		<EmptyState icon={History} title="No records yet" description="Views and actions are recorded here as people use the platform." />
	{/if}
{/snippet}

<DataTable
	{rows}
	{columns}
	key={(r) => r.id}
	caption="Platform ledger entries"
	pagination={{ page, pageSize, total, href: (p) => recordHistoryUrl(filters, p, pageSize) }}
	{toolbar}
	{empty}
	{mobile}
/>

<Dialog.Root bind:open={detailsOpen}>
	<Dialog.Content class="max-h-[85vh] max-w-3xl overflow-y-auto">
		<Dialog.Header>
			<Dialog.Title>Ledger entry</Dialog.Title>
			<Dialog.Description>
				{#if selected}{actionLabel(selected.action)} · {entityLabel(selected.entityType)}{/if}
			</Dialog.Description>
		</Dialog.Header>
		{#if selected}<ActivityLog entries={[selected]} showEntity />{/if}
		<Dialog.Footer>
			<Button variant="outline" on:click={() => (detailsOpen = false)}>Close</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
