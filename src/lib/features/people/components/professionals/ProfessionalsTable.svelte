<script lang="ts">
	import type { Snippet } from 'svelte';
	import DataTable from '$dtss/DataTable.svelte';
	import type { DataColumn, SortState } from '$dtss/tableState';
	import DisciplineCell from '$lib/components/tables/DisciplineCell.svelte';
	import { formatUSPhoneForDisplay } from '$lib/_helpers/phone';
	import type { ProfessionalRow } from '../../lists';
	import PersonAvatar from '../PersonAvatar.svelte';
	import { initialsOf } from '../../people';

	let {
		rows,
		sort,
		sortHref,
		highlightDisciplineIds = [],
		tabs,
		toolbar,
		empty
	}: {
		rows: ProfessionalRow[];
		sort?: SortState;
		sortHref?: (column: string) => string;
		highlightDisciplineIds?: string[];
		tabs?: Snippet;
		toolbar?: Snippet;
		empty?: Snippet;
	} = $props();

	const lastFirst = (r: ProfessionalRow) => `${r.user.lastName ?? ''}, ${r.user.firstName ?? ''}`;
	const created = (r: ProfessionalRow) => new Date(r.profile.createdAt).toLocaleDateString();
	const phone = (r: ProfessionalRow) => formatUSPhoneForDisplay(r.profile.cellPhone ?? '') || '—';

	const columns: DataColumn<ProfessionalRow>[] = [
		{ id: 'name', header: 'Name', cell: nameCell, sortable: true },
		{ id: 'disciplines', header: 'Discipline', cell: disciplineCell, sortable: true },
		{ id: 'email', header: 'Email', value: (r) => r.user.email || '—', sortable: true, class: 'max-w-56 truncate' },
		{ id: 'cellPhone', header: 'Cell', value: phone, sortable: true, class: 'whitespace-nowrap tabular-nums' },
		{ id: 'address', header: 'Address', value: (r) => r.profile.completeAddress || '—', sortable: true, class: 'max-w-64 truncate' },
		{ id: 'createdAt', header: 'Created', value: created, sortable: true, class: 'whitespace-nowrap tabular-nums' }
	];
</script>

{#snippet nameCell(r: ProfessionalRow)}
	<span class="inline-flex items-center gap-3">
		<PersonAvatar name={lastFirst(r)} src={r.user.avatarUrl} initials={initialsOf(r.user.firstName, r.user.lastName)} audience="pro" />
		<span class="whitespace-nowrap">{lastFirst(r)}</span>
	</span>
{/snippet}

{#snippet disciplineCell(r: ProfessionalRow)}
	<DisciplineCell disciplines={r.disciplines ?? []} highlightIds={highlightDisciplineIds} />
{/snippet}

{#snippet mobile(r: ProfessionalRow)}
	<div class="flex items-start gap-3">
		<PersonAvatar name={lastFirst(r)} src={r.user.avatarUrl} initials={initialsOf(r.user.firstName, r.user.lastName)} size="md" audience="pro" />
		<div class="min-w-0 flex-1">
			<p class="truncate font-semibold">{lastFirst(r)}</p>
			<p class="truncate text-sm text-muted-foreground">{r.user.email || '—'} · {phone(r)}</p>
			{#if r.profile.completeAddress}<p class="truncate text-sm text-muted-foreground">{r.profile.completeAddress}</p>{/if}
			{#if r.disciplines?.length}
				<div class="relative z-10 mt-2"><DisciplineCell disciplines={r.disciplines} highlightIds={highlightDisciplineIds} /></div>
			{/if}
		</div>
	</div>
{/snippet}

<DataTable
	{rows}
	{columns}
	key={(r) => r.profile.id}
	rowHref={(r) => `/professionals/${r.profile.id}`}
	rowLabel={(r) => `Open ${r.user.firstName ?? ''} ${r.user.lastName ?? ''}`.trim()}
	caption="Professionals"
	{sort}
	{sortHref}
	{tabs}
	{toolbar}
	{empty}
	{mobile}
/>
