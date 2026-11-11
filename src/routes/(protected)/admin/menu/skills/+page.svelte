<script lang="ts">
	import { enhance } from '$app/forms';
	import { Loader2, Plus, Sparkles } from 'lucide-svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import Page from '$dtss/Page.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Select from '$lib/components/ui/select';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import {
		TaxonomyConfirmDialog,
		TaxonomySearchField,
		SkillsTable,
		type SkillRow
	} from '$features/admin/components/taxonomy';

	let { data, form } = $props();

	let dialogOpen = $state(false);
	let saving = $state(false);
	let editing = $state<SkillRow | null>(null);
	let formName = $state('');
	let formCategoryId = $state('');
	let formRequiresCertificate = $state(false);

	let archiveOpen = $state(false);
	let deleteOpen = $state(false);
	let target = $state<SkillRow | null>(null);

	const search = $derived(data.searchTerm ?? '');
	const skills = $derived(data.skills as SkillRow[]);
	const categories = $derived(data.categories);
	const groups = $derived(
		categories
			.map((c) => ({ category: c, skills: skills.filter((s) => s.categoryId === c.id) }))
			.filter((g) => g.skills.length > 0 || !search)
	);
	const selectedCategory = $derived(
		categories.find((c) => c.id === formCategoryId)
			? { value: formCategoryId, label: categories.find((c) => c.id === formCategoryId)!.name }
			: undefined
	);

	function openAdd(categoryId = '') {
		editing = null;
		formName = '';
		formCategoryId = categoryId || categories.find((c) => !c.archivedAt)?.id || '';
		formRequiresCertificate = false;
		dialogOpen = true;
	}

	function openEdit(s: SkillRow) {
		editing = s;
		formName = s.name;
		formCategoryId = s.categoryId;
		formRequiresCertificate = s.requiresCertificate;
		dialogOpen = true;
	}
</script>

<Page>
	<PageHeader
		title="Skills"
		description="Skills professionals can hold and requests can require. A skill that needs a certificate (e.g. CPR/BLS) only counts while a valid one is on file."
	>
		{#snippet actions()}
			<Button variant="outline" href="/admin/menu/skill-categories">Manage categories</Button>
			<Button on:click={() => openAdd()} disabled={categories.length === 0}>
				<Plus class="mr-2 size-4" aria-hidden="true" />Add skill
			</Button>
		{/snippet}
	</PageHeader>

	<div class="flex flex-wrap items-center gap-3">
		<TaxonomySearchField label="Search skills or categories" value={search} />
		{#if search}<p class="text-sm text-muted-foreground">Clear the search to reorder.</p>{/if}
	</div>

	{#if groups.length > 0}
		<nav aria-label="Jump to category" class="flex flex-wrap gap-2">
			{#each groups as g (g.category.id)}
				<a
					href="#category-{g.category.id}"
					class="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					{g.category.name}
					<span class="rounded-full bg-muted px-1.5 text-xs font-bold tabular-nums text-muted-foreground">{g.skills.length}</span>
				</a>
			{/each}
		</nav>
	{/if}

	{#if categories.length === 0}
		<EmptyState icon={Sparkles} title="Create a skill category first" description="Every skill belongs to a category.">
			<Button href="/admin/menu/skill-categories">Go to skill categories</Button>
		</EmptyState>
	{:else if groups.length === 0}
		<EmptyState icon={Sparkles} title="No results for “{search}”" description="Try a different skill or category name." />
	{/if}

	{#each groups as g (g.category.id)}
		<SkillsTable
			category={g.category}
			rows={g.skills}
			{search}
			onAdd={openAdd}
			onEdit={openEdit}
			onArchive={(s) => {
				target = s;
				archiveOpen = true;
			}}
			onDelete={(s) => {
				target = s;
				deleteOpen = true;
			}}
		/>
	{/each}
</Page>

<Dialog.Root bind:open={dialogOpen}>
	<Dialog.Content class="sm:max-w-lg">
		<form
			method="POST"
			action={editing ? '?/editSkill' : '?/addSkill'}
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
				<Dialog.Title class="text-h2">{editing ? 'Edit skill' : 'Add skill'}</Dialog.Title>
				<Dialog.Description>Skills sit in a category; practices require them per request.</Dialog.Description>
			</Dialog.Header>
			{#if editing}<input type="hidden" name="id" value={editing.id} />{/if}
			<div class="space-y-4">
				<div class="space-y-1.5">
					<Label for="skill-name" class="font-semibold">Name</Label>
					<Input id="skill-name" name="name" bind:value={formName} required maxlength={80} />
				</div>
				<div class="space-y-1.5">
					<Label for="skill-category" class="font-semibold">Category</Label>
					<Select.Root
						selected={selectedCategory}
						onSelectedChange={(v) => {
							if (v) formCategoryId = String(v.value);
						}}
					>
						<Select.Trigger id="skill-category" class="w-full">
							<Select.Value placeholder="Choose a category" />
						</Select.Trigger>
						<Select.Content>
							{#each categories as c (c.id)}
								<Select.Item value={c.id} label={c.name} disabled={!!c.archivedAt && c.id !== editing?.categoryId}>
									{c.name}{c.archivedAt ? ' (archived)' : ''}
								</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
					<input type="hidden" name="categoryId" value={formCategoryId} />
				</div>
				<div class="flex items-start gap-3 rounded-lg border bg-muted/40 p-4">
					<Checkbox id="skill-cert" bind:checked={formRequiresCertificate} class="mt-0.5" />
					{#if formRequiresCertificate}<input type="hidden" name="requiresCertificate" value="on" />{/if}
					<div>
						<Label for="skill-cert" class="font-semibold">Requires a certificate</Label>
						<p class="mt-1 text-sm text-muted-foreground">
							The professional uploads a dated certificate linked to this skill. It stops counting for
							matching once that certificate expires.
						</p>
					</div>
				</div>
				{#if form?.message}<p class="text-sm text-destructive" role="alert">{form.message}</p>{/if}
			</div>
			<Dialog.Footer class="gap-2">
				<Button variant="outline" on:click={() => (dialogOpen = false)}>Cancel</Button>
				<Button type="submit" disabled={saving || !formCategoryId}>
					{#if saving}<Loader2 class="mr-2 size-4 animate-spin" aria-hidden="true" />{/if}
					{editing ? 'Save changes' : 'Add skill'}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<TaxonomyConfirmDialog
	bind:open={archiveOpen}
	title={target?.archivedAt ? `Restore ${target?.name}?` : `Archive ${target?.name ?? 'this skill'}?`}
	description={target?.archivedAt
		? 'The skill becomes available to choose again.'
		: 'The skill is hidden from new choices. Professionals and requests that already have it keep it, and you can restore it later.'}
	action="?/setArchived"
	fields={{ id: target?.id ?? '', archived: target?.archivedAt ? 'false' : 'true' }}
	confirmLabel={target?.archivedAt ? 'Restore skill' : 'Archive skill'}
	destructive={false}
/>

<TaxonomyConfirmDialog
	bind:open={deleteOpen}
	title="Delete {target?.name ?? 'this skill'}?"
	description="No professional holds this skill and no request requires it, so it's removed for good. This can't be undone."
	action="?/deleteSkill"
	fields={{ id: target?.id ?? '' }}
	confirmLabel="Delete skill"
	confirmText="DELETE"
/>
