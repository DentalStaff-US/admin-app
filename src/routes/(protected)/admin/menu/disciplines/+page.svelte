<script lang="ts">
	import { page } from '$app/state';
	import { Loader2, Plus } from 'lucide-svelte';
	import { superForm } from 'sveltekit-superforms/client';
	import Page from '$dtss/Page.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';
	import { readSort, sortHrefFor } from '$dtss/tableState';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import {
		TaxonomyConfirmDialog,
		DisciplineFields,
		DisciplinesTable,
		TaxonomySearchField,
		sortLoadedRows,
		type DisciplineRow
	} from '$features/admin/components/taxonomy';

	let { data } = $props();

	let addOpen = $state(false);
	let editOpen = $state(false);
	let deleteOpen = $state(false);
	let toDelete = $state<DisciplineRow | null>(null);

	const {
		form: addForm,
		errors: addErrors,
		enhance: addEnhance,
		submitting: addSubmitting
	} = superForm(data.form, {
		onResult: ({ result }) => {
			if (result.type === 'success') {
				addOpen = false;
				// Reset the flag too, or the next discipline added in the same session
				// inherits the previous one's checkbox state.
				$addForm = { name: '', abbreviation: '', requiresLicense: false };
			}
		}
	});

	const {
		form: editForm,
		errors: editErrors,
		enhance: editEnhance,
		submitting: editSubmitting
	} = superForm(data.editForm, {
		onResult: ({ result }) => {
			if (result.type === 'success') editOpen = false;
		}
	});

	const {
		form: deleteForm,
		enhance: deleteEnhance,
		submitting: deleteSubmitting
	} = superForm(data.deleteForm, {
		onResult: ({ result }) => {
			if (result.type === 'success') deleteOpen = false;
		}
	});

	const SORTABLE = ['name', 'abbreviation', 'requiresLicense', 'createdAt', 'updatedAt'];
	const sort = $derived(readSort(page.url, SORTABLE, { column: 'name', direction: 'asc' }));
	const rows = $derived(
		sortLoadedRows(data.disciplines as DisciplineRow[], {
			name: (r) => r.name,
			abbreviation: (r) => r.abbreviation,
			// Flagged disciplines sort together: how staff see which ones are configured.
			requiresLicense: (r) => Number(r.requiresLicense),
			createdAt: (r) => new Date(r.createdAt).getTime(),
			updatedAt: (r) => new Date(r.updatedAt).getTime()
		}, sort)
	);

	function openEdit(row: DisciplineRow) {
		$editForm = {
			id: row.id,
			name: row.name,
			abbreviation: row.abbreviation,
			// MUST be seeded from the row. Omitting it would send the schema default
			// (false) on every save, so editing a discipline's name would silently turn
			// off certification enforcement for everyone holding it.
			requiresLicense: row.requiresLicense
		};
		editOpen = true;
	}

	function openDelete(row: DisciplineRow) {
		toDelete = row;
		$deleteForm = { id: row.id };
		deleteOpen = true;
	}
</script>

<Page>
	<PageHeader title="Disciplines" description="The roles professionals hold and practices request, and whether each needs a license.">
		{#snippet actions()}
			<Button on:click={() => (addOpen = true)}><Plus class="mr-2 size-4" aria-hidden="true" />Add discipline</Button>
		{/snippet}
	</PageHeader>

	<TaxonomySearchField label="Search disciplines" value={page.url.searchParams.get('search') ?? ''} />

	<DisciplinesTable
		{rows}
		search={page.url.searchParams.get('search') ?? ''}
		{sort}
		sortHref={(column) => sortHrefFor(page.url, sort, column)}
		onAdd={() => (addOpen = true)}
		onEdit={openEdit}
		onDelete={openDelete}
	/>
</Page>

<Dialog.Root bind:open={addOpen}>
	<Dialog.Content class="sm:max-w-lg">
		<form method="POST" action="?/addDiscipline" use:addEnhance class="space-y-6">
			<Dialog.Header>
				<Dialog.Title class="text-h2">Add discipline</Dialog.Title>
				<Dialog.Description>A role professionals can hold and practices can request.</Dialog.Description>
			</Dialog.Header>
			<DisciplineFields
				bind:name={$addForm.name}
				bind:abbreviation={$addForm.abbreviation}
				bind:requiresLicense={$addForm.requiresLicense}
				errors={$addErrors}
			/>
			<Dialog.Footer class="gap-2">
				<Button variant="outline" on:click={() => (addOpen = false)}>Cancel</Button>
				<Button type="submit" disabled={$addSubmitting}>
					{#if $addSubmitting}<Loader2 class="mr-2 size-4 animate-spin" aria-hidden="true" />{/if}
					Add discipline
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={editOpen}>
	<Dialog.Content class="sm:max-w-lg">
		<form method="POST" action="?/editDiscipline" use:editEnhance class="space-y-6">
			<Dialog.Header>
				<Dialog.Title class="text-h2">Edit discipline</Dialog.Title>
				<Dialog.Description>Changes apply everywhere this discipline is used.</Dialog.Description>
			</Dialog.Header>
			<input type="hidden" name="id" value={$editForm.id} />
			<DisciplineFields
				editing
				bind:name={$editForm.name}
				bind:abbreviation={$editForm.abbreviation}
				bind:requiresLicense={$editForm.requiresLicense}
				errors={$editErrors}
			/>
			<Dialog.Footer class="gap-2">
				<Button variant="outline" on:click={() => (editOpen = false)}>Cancel</Button>
				<Button type="submit" disabled={$editSubmitting}>
					{#if $editSubmitting}<Loader2 class="mr-2 size-4 animate-spin" aria-hidden="true" />{/if}
					Save changes
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<TaxonomyConfirmDialog
	bind:open={deleteOpen}
	title="Delete {toDelete?.name ?? 'this discipline'}?"
	description="The discipline is removed from the list professionals and practices choose from. This can't be undone."
	action="?/deleteDiscipline"
	fields={{ id: $deleteForm.id ?? '' }}
	confirmLabel="Delete discipline"
	confirmText="DELETE"
	enhance={deleteEnhance}
	submitting={$deleteSubmitting}
/>
