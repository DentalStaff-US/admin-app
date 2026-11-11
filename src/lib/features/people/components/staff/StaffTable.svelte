<script lang="ts">
	import type { Snippet } from 'svelte';
	import DataTable from '$dtss/DataTable.svelte';
	import type { DataColumn, SortState } from '$dtss/tableState';
	import type { StaffRow } from '../../lists';
	import PersonAvatar from '../PersonAvatar.svelte';
	import { initialsOf, staffRoleLabel } from '../../people';

	/**
	 * Practice staff. There's no staff detail page, so the first cell is a
	 * button that opens the details dialog (keyboard reachable, unlike the old
	 * clickable row).
	 */
	let {
		rows,
		sort,
		sortHref,
		onOpen,
		tabs,
		toolbar,
		empty,
		actions
	}: {
		rows: StaffRow[];
		sort?: SortState;
		sortHref?: (column: string) => string;
		onOpen?: (row: StaffRow) => void;
		tabs?: Snippet;
		toolbar?: Snippet;
		empty?: Snippet;
		/** Optional trailing cell (row menu). */
		actions?: Snippet<[StaffRow]>;
	} = $props();

	const lastFirst = (r: StaffRow) => `${r.user.lastName ?? ''}, ${r.user.firstName ?? ''}`;

	const columns: DataColumn<StaffRow>[] = $derived([
		{ id: 'name', header: 'Name', cell: nameCell, sortable: true },
		{ id: 'email', header: 'Email', value: (r) => r.user.email, sortable: true, class: 'max-w-64 truncate' },
		{ id: 'role', header: 'Role', cell: roleCell, sortable: true },
		{ id: 'createdAt', header: 'Joined', value: (r) => new Date(r.profile.createdAt).toLocaleDateString(), sortable: true, class: 'whitespace-nowrap tabular-nums' },
		...(actions ? [{ id: 'actions', header: 'Actions', srOnlyHeader: true, cell: actions, class: 'text-right' }] : [])
	]);
</script>

{#snippet nameCell(r: StaffRow)}
	<span class="inline-flex items-center gap-3">
		<PersonAvatar name={lastFirst(r)} src={r.user.avatarUrl} initials={initialsOf(r.user.firstName, r.user.lastName)} />
		{#if onOpen}
			<button
				type="button"
				class="whitespace-nowrap rounded font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				onclick={() => onOpen(r)}
			>
				{lastFirst(r)}
			</button>
		{:else}
			<span class="whitespace-nowrap font-semibold">{lastFirst(r)}</span>
		{/if}
	</span>
{/snippet}

{#snippet roleCell(r: StaffRow)}
	<span class="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">{staffRoleLabel(r.profile.staffRole)}</span>
{/snippet}

{#snippet mobile(r: StaffRow)}
	<div class="flex items-center gap-3">
		<PersonAvatar name={lastFirst(r)} src={r.user.avatarUrl} initials={initialsOf(r.user.firstName, r.user.lastName)} size="md" />
		<div class="min-w-0 flex-1">
			{#if onOpen}
				<button type="button" class="truncate text-left font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onclick={() => onOpen(r)}>{lastFirst(r)}</button>
			{:else}
				<p class="truncate font-semibold">{lastFirst(r)}</p>
			{/if}
			<p class="truncate text-sm text-muted-foreground">{r.user.email}</p>
		</div>
		{@render roleCell(r)}
		{#if actions}{@render actions(r)}{/if}
	</div>
{/snippet}

<DataTable {rows} {columns} key={(r) => r.profile.id} caption="Practice staff" {sort} {sortHref} {tabs} {toolbar} {empty} {mobile} />
