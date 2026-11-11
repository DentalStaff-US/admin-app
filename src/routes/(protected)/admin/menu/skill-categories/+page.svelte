<script lang="ts">
	import { enhance } from '$app/forms';
	import { Loader2, Plus } from 'lucide-svelte';
	import Page from '$dtss/Page.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import {
		TaxonomyConfirmDialog,
		TaxonomySearchField,
		SkillCategoriesTable,
		type SkillCategoryRow
	} from '$features/admin/components/taxonomy';

	let { data, form } = $props();

	let dialogOpen = $state(false);
	let saving = $state(false);
	/** null = adding a new category. */
	let editing = $state<SkillCategoryRow | null>(null);
	let formName = $state('');
	let formDescription = $state('');
	let formDisciplineIds = $state<string[]>([]);

	let archiveOpen = $state(false);
	let deleteOpen = $state(false);
	let target = $state<SkillCategoryRow | null>(null);

	const categories = $derived(data.categories as SkillCategoryRow[]);
	const disciplineName = $derived(new Map(data.disciplines.map((d) => [d.id, d.abbreviation || d.name])));

	function openAdd() {
		editing = null;
		formName = '';
		formDescription = '';
		formDisciplineIds = [];
		dialogOpen = true;
	}

	function openEdit(c: SkillCategoryRow) {
		editing = c;
		formName = c.name;
		formDescription = c.description ?? '';
		formDisciplineIds = [...c.disciplineIds];
		dialogOpen = true;
	}

	function toggleDiscipline(id: string, on: boolean) {
		formDisciplineIds = on ? [...formDisciplineIds, id] : formDisciplineIds.filter((d) => d !== id);
	}
</script>

<Page>
	<PageHeader
		title="Skill categories"
		description="Group skills and choose which disciplines each category applies to. Practices set a requirement, or No preference, per category on each requisition."
	>
		{#snippet actions()}
			<Button variant="outline" href="/admin/menu/skills">Manage skills</Button>
			<Button on:click={openAdd}><Plus class="mr-2 size-4" aria-hidden="true" />Add category</Button>
		{/snippet}
	</PageHeader>

	<div class="flex flex-wrap items-center gap-3">
		<TaxonomySearchField label="Search categories" value={data.searchTerm ?? ''} />
		{#if data.searchTerm}<p class="text-sm text-muted-foreground">Clear the search to reorder.</p>{/if}
	</div>

	<SkillCategoriesTable
		rows={categories}
		{disciplineName}
		search={data.searchTerm ?? ''}
		onAdd={openAdd}
		onEdit={openEdit}
		onArchive={(c) => {
			target = c;
			archiveOpen = true;
		}}
		onDelete={(c) => {
			target = c;
			deleteOpen = true;
		}}
	/>
</Page>

<Dialog.Root bind:open={dialogOpen}>
	<Dialog.Content class="sm:max-w-lg">
		<form
			method="POST"
			action={editing ? '?/editCategory' : '?/addCategory'}
			class="space-y-6"
			use:enhance={() => {
				saving = true;
				return async ({ result, update }) => {
					saving = false;
					if (result.type === 'success') dialogOpen = false;
					await update();
				};
			}}
		>
			<Dialog.Header>
				<Dialog.Title class="text-h2">{editing ? 'Edit category' : 'Add skill category'}</Dialog.Title>
				<Dialog.Description>Practices set one requirement per category on each requisition.</Dialog.Description>
			</Dialog.Header>
			{#if editing}<input type="hidden" name="id" value={editing.id} />{/if}
			<div class="space-y-4">
				<div class="space-y-1.5">
					<Label for="cat-name" class="font-semibold">Name</Label>
					<Input id="cat-name" name="name" bind:value={formName} required maxlength={80} />
				</div>
				<div class="space-y-1.5">
					<Label for="cat-desc" class="font-semibold">Description <span class="font-normal text-muted-foreground">(optional)</span></Label>
					<Input id="cat-desc" name="description" bind:value={formDescription} maxlength={300} />
				</div>
				<fieldset class="space-y-2">
					<legend class="text-sm font-semibold">Applies to disciplines</legend>
					<p class="text-sm text-muted-foreground">Leave all unchecked to apply to every discipline.</p>
					<div class="grid gap-2 sm:grid-cols-2">
						{#each data.disciplines as d (d.id)}
							{@const checked = formDisciplineIds.includes(d.id)}
							<div class="flex items-center gap-2">
								<Checkbox id="cat-discipline-{d.id}" {checked} onCheckedChange={(v) => toggleDiscipline(d.id, v === true)} />
								<Label for="cat-discipline-{d.id}" class="font-normal">{d.name}</Label>
								{#if checked}<input type="hidden" name="disciplineIds" value={d.id} />{/if}
							</div>
						{/each}
					</div>
				</fieldset>
				{#if form?.message}<p class="text-sm text-destructive" role="alert">{form.message}</p>{/if}
			</div>
			<Dialog.Footer class="gap-2">
				<Button variant="outline" on:click={() => (dialogOpen = false)}>Cancel</Button>
				<Button type="submit" disabled={saving}>
					{#if saving}<Loader2 class="mr-2 size-4 animate-spin" aria-hidden="true" />{/if}
					{editing ? 'Save changes' : 'Add category'}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<TaxonomyConfirmDialog
	bind:open={archiveOpen}
	title={target?.archivedAt ? `Restore ${target?.name}?` : `Archive ${target?.name ?? 'this category'}?`}
	description={target?.archivedAt
		? 'The category becomes available to choose again.'
		: 'The category is hidden from new choices. Requisitions that already use it keep it, and you can restore it later.'}
	action="?/setArchived"
	fields={{ id: target?.id ?? '', archived: target?.archivedAt ? 'false' : 'true' }}
	confirmLabel={target?.archivedAt ? 'Restore category' : 'Archive category'}
	destructive={false}
/>

<TaxonomyConfirmDialog
	bind:open={deleteOpen}
	title="Delete {target?.name ?? 'this category'}?"
	description="The category has no skills and isn't used by any requisition, so it's removed for good. This can't be undone."
	action="?/deleteCategory"
	fields={{ id: target?.id ?? '' }}
	confirmLabel="Delete category"
	confirmText="DELETE"
/>
