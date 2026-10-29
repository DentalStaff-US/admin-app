<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import type { PageData } from './$types';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import {
		ArrowDown,
		ArrowUp,
		Archive,
		ArchiveRestore,
		Edit,
		FolderOpen,
		Loader2,
		Trash
	} from 'lucide-svelte';

	export let data: PageData;

	type Category = PageData['categories'][number];

	let searchTerm = data.searchTerm ?? '';
	let dialogOpen = false;
	let saving = false;
	/** null = adding a new category. */
	let editing: Category | null = null;
	let formName = '';
	let formDescription = '';
	let formDisciplineIds = new Set<string>();

	$: categories = data.categories;
	$: disciplineName = new Map(data.disciplines.map((d) => [d.id, d.abbreviation || d.name]));

	function openAdd() {
		editing = null;
		formName = '';
		formDescription = '';
		formDisciplineIds = new Set();
		dialogOpen = true;
	}

	function openEdit(c: Category) {
		editing = c;
		formName = c.name;
		formDescription = c.description ?? '';
		formDisciplineIds = new Set(c.disciplineIds);
		dialogOpen = true;
	}

	function toggleDiscipline(id: string) {
		if (formDisciplineIds.has(id)) formDisciplineIds.delete(id);
		else formDisciplineIds.add(id);
		formDisciplineIds = formDisciplineIds;
	}

	/** The full order with `id` moved one step — posted to ?/reorder. */
	function movedOrder(id: string, delta: -1 | 1): string[] {
		const ids = categories.map((c) => c.id);
		const i = ids.indexOf(id);
		const j = i + delta;
		if (i < 0 || j < 0 || j >= ids.length) return ids;
		[ids[i], ids[j]] = [ids[j], ids[i]];
		return ids;
	}

	function handleSearch() {
		const q = searchTerm.trim();
		goto(q ? `/admin/menu/skill-categories?search=${encodeURIComponent(q)}` : '/admin/menu/skill-categories');
	}
</script>

<section class="flex flex-col h-full p-6 pb-16 space-y-6">
	<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Skill Categories</h1>
			<p class="text-muted-foreground">
				Group skills, and choose which disciplines each category applies to. Clients set a
				requirement (or No Preference) per category on each requisition.
			</p>
		</div>
		<Button class="bg-primary hover:bg-primary/90" on:click={openAdd}>Add New Category</Button>
	</div>

	<form on:submit|preventDefault={handleSearch} class="flex items-center gap-2">
		<Input bind:value={searchTerm} placeholder="Search categories..." class="bg-white max-w-xs" />
		<Button size="sm" type="submit" class="bg-primary hover:bg-primary/90">Search</Button>
	</form>

	<div class="bg-white rounded-lg shadow-sm border">
		{#if categories.length === 0}
			<div class="flex flex-col items-center justify-center py-12 text-center">
				<div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
					<FolderOpen class="w-8 h-8 text-gray-400" />
				</div>
				<h3 class="text-lg font-medium text-gray-900 mb-2">No categories found</h3>
				{#if !searchTerm}
					<Button on:click={openAdd}>Add Your First Category</Button>
				{/if}
			</div>
		{:else}
			<ul class="divide-y">
				{#each categories as c, i (c.id)}
					<li class="flex flex-wrap items-center gap-3 px-4 py-3" class:opacity-60={!!c.archivedAt}>
						<div class="flex flex-col">
							<form method="POST" action="?/reorder" use:enhance>
								{#each movedOrder(c.id, -1) as id}<input type="hidden" name="orderedIds" value={id} />{/each}
								<button type="submit" disabled={i === 0 || !!searchTerm} class="disabled:opacity-30" aria-label="Move up">
									<ArrowUp class="h-3 w-3" />
								</button>
							</form>
							<form method="POST" action="?/reorder" use:enhance>
								{#each movedOrder(c.id, 1) as id}<input type="hidden" name="orderedIds" value={id} />{/each}
								<button type="submit" disabled={i === categories.length - 1 || !!searchTerm} class="disabled:opacity-30" aria-label="Move down">
									<ArrowDown class="h-3 w-3" />
								</button>
							</form>
						</div>

						<div class="flex-1 min-w-[12rem]">
							<div class="flex items-center gap-2">
								<span class="font-medium">{c.name}</span>
								{#if c.archivedAt}<span class="pill pill-secondary">Archived</span>{/if}
							</div>
							{#if c.description}
								<p class="text-xs text-muted-foreground">{c.description}</p>
							{/if}
							<div class="mt-1 flex flex-wrap gap-1">
								{#if c.disciplineIds.length === 0}
									<span class="pill pill-outline">All disciplines</span>
								{:else}
									{#each c.disciplineIds as d}
										<span class="pill pill-outline">{disciplineName.get(d) ?? d}</span>
									{/each}
								{/if}
							</div>
						</div>

						<div class="text-xs text-muted-foreground w-40">
							{c.skillCount} skill{c.skillCount === 1 ? '' : 's'} · used by {c.requisitionCount}
							requisition{c.requisitionCount === 1 ? '' : 's'}
						</div>

						<div class="flex items-center gap-1">
							<Button variant="ghost" size="sm" on:click={() => openEdit(c)} aria-label="Edit">
								<Edit class="h-4 w-4" />
							</Button>
							<form method="POST" action="?/setArchived" use:enhance>
								<input type="hidden" name="id" value={c.id} />
								<input type="hidden" name="archived" value={c.archivedAt ? 'false' : 'true'} />
								<Button type="submit" variant="ghost" size="sm" aria-label={c.archivedAt ? 'Restore' : 'Archive'}>
									{#if c.archivedAt}<ArchiveRestore class="h-4 w-4" />{:else}<Archive class="h-4 w-4" />{/if}
								</Button>
							</form>
							{#if c.skillCount === 0 && c.requisitionCount === 0}
								<form method="POST" action="?/deleteCategory" use:enhance>
									<input type="hidden" name="id" value={c.id} />
									<Button type="submit" variant="destructive" size="sm" aria-label="Delete">
										<Trash size={16} />
									</Button>
								</form>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</section>

<Dialog.Root bind:open={dialogOpen}>
	<Dialog.Content class="sm:max-w-[480px]">
		<form
			method="POST"
			action={editing ? '?/editCategory' : '?/addCategory'}
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
				<Dialog.Title>{editing ? 'Edit Category' : 'Add New Skill Category'}</Dialog.Title>
			</Dialog.Header>
			{#if editing}<input type="hidden" name="id" value={editing.id} />{/if}
			<div class="space-y-4 py-4">
				<div class="space-y-1">
					<label for="cat-name" class="text-sm font-medium">Name</label>
					<Input id="cat-name" name="name" bind:value={formName} required maxlength={80} />
				</div>
				<div class="space-y-1">
					<label for="cat-desc" class="text-sm font-medium">Description (optional)</label>
					<Input id="cat-desc" name="description" bind:value={formDescription} maxlength={300} />
				</div>
				<fieldset class="space-y-1">
					<legend class="text-sm font-medium">Applies to disciplines</legend>
					<p class="text-xs text-muted-foreground">Leave all unchecked to apply to every discipline.</p>
					<div class="grid grid-cols-2 gap-1">
						{#each data.disciplines as d (d.id)}
							<label class="flex items-center gap-2 text-sm">
								<input
									type="checkbox"
									name="disciplineIds"
									value={d.id}
									checked={formDisciplineIds.has(d.id)}
									on:change={() => toggleDiscipline(d.id)}
								/>
								{d.name}
							</label>
						{/each}
					</div>
				</fieldset>
			</div>
			<Dialog.Footer>
				<Button variant="destructiveOutline" type="button" on:click={() => (dialogOpen = false)}>
					Cancel
				</Button>
				<Button type="submit" class="bg-primary hover:bg-primary/90" disabled={saving}>
					{#if saving}<Loader2 class="mr-2 h-4 w-4 animate-spin" />{/if}
					{editing ? 'Save' : 'Add Category'}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<style>
	.pill {
		display: inline-flex;
		align-items: center;
		border-radius: 9999px;
		border-width: 1px;
		padding: 0 0.5rem;
		font-size: 0.75rem;
		line-height: 1.25rem;
		font-weight: 500;
	}
	.pill-outline {
		border-color: rgb(229 231 235);
		color: rgb(55 65 81);
	}
	.pill-secondary {
		border-color: transparent;
		background: rgb(243 244 246);
		color: rgb(75 85 99);
	}
</style>
