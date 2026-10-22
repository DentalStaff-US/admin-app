<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import type { PageData } from './$types';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import {
		ArrowDown,
		ArrowUp,
		Archive,
		ArchiveRestore,
		Edit,
		FileBadge,
		Loader2,
		Sparkles,
		Trash
	} from 'lucide-svelte';

	export let data: PageData;

	type SkillRow = PageData['skills'][number];

	let searchTerm = data.searchTerm ?? '';
	let dialogOpen = false;
	let saving = false;
	let editing: SkillRow | null = null;
	let formName = '';
	let formCategoryId = '';
	let formRequiresCertificate = false;

	$: skills = data.skills;
	$: categories = data.categories;
	$: groups = categories
		.map((c) => ({ category: c, skills: skills.filter((s) => s.categoryId === c.id) }))
		.filter((g) => g.skills.length > 0 || !searchTerm);

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

	/** The category's skill order with `id` moved one step. Sort order is per category. */
	function movedOrder(list: SkillRow[], id: string, delta: -1 | 1): string[] {
		const ids = list.map((s) => s.id);
		const i = ids.indexOf(id);
		const j = i + delta;
		if (i < 0 || j < 0 || j >= ids.length) return ids;
		[ids[i], ids[j]] = [ids[j], ids[i]];
		return ids;
	}

	function handleSearch() {
		const q = searchTerm.trim();
		goto(q ? `/admin/menu/skills?search=${encodeURIComponent(q)}` : '/admin/menu/skills');
	}
</script>

<section class="flex flex-col h-full p-6 pb-16 space-y-6">
	<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Skills</h1>
			<p class="text-muted-foreground">
				Skills professionals can hold and requisitions can require. Mark a skill as needing a
				certificate (e.g. CPR/BLS) and it only counts while a valid one is on file.
			</p>
		</div>
		<div class="flex gap-2">
			<Button variant="outline" href="/admin/menu/skill-categories">Manage Categories</Button>
			<Button class="bg-primary hover:bg-primary/90" on:click={() => openAdd()} disabled={categories.length === 0}>
				Add New Skill
			</Button>
		</div>
	</div>

	<form on:submit|preventDefault={handleSearch} class="flex items-center gap-2">
		<Input bind:value={searchTerm} placeholder="Search skills or categories..." class="bg-white max-w-xs" />
		<Button size="sm" type="submit" class="bg-primary hover:bg-primary/90">Search</Button>
	</form>

	<!-- Per-category counts; each jumps to its group below. -->
	{#if groups.length > 0}
		<div class="flex flex-wrap gap-2">
			{#each groups as g (g.category.id)}
				<Badge
					variant="secondary"
					class="text-xs"
					href={`#category-${g.category.id}`}
					value={`${g.category.name}: ${g.skills.length}`}
				/>
			{/each}
		</div>
	{/if}

	{#if categories.length === 0}
		<div class="bg-white rounded-lg border p-8 text-center">
			<Sparkles class="mx-auto mb-3 h-8 w-8 text-gray-400" />
			<p class="mb-4 text-sm text-muted-foreground">Create a skill category first.</p>
			<Button href="/admin/menu/skill-categories">Go to Skill Categories</Button>
		</div>
	{/if}

	{#each groups as g (g.category.id)}
		<div
			id={`category-${g.category.id}`}
			class="bg-white rounded-lg shadow-sm border scroll-mt-6"
			class:opacity-60={!!g.category.archivedAt}
		>
			<div class="flex items-center justify-between border-b px-4 py-2">
				<div class="flex items-center gap-2">
					<h2 class="font-semibold">{g.category.name}</h2>
					{#if g.category.archivedAt}<span class="pill pill-secondary">Archived</span>{/if}
					<span class="text-xs text-muted-foreground">{g.skills.length} skills</span>
				</div>
				{#if !g.category.archivedAt}
					<Button variant="ghost" size="sm" on:click={() => openAdd(g.category.id)}>+ Add skill</Button>
				{/if}
			</div>
			{#if g.skills.length === 0}
				<p class="px-4 py-3 text-sm text-muted-foreground">No skills yet.</p>
			{:else}
				<ul class="divide-y">
					{#each g.skills as s, i (s.id)}
						<li class="flex flex-wrap items-center gap-3 px-4 py-2" class:opacity-60={!!s.archivedAt}>
							<div class="flex flex-col">
								<form method="POST" action="?/reorder" use:enhance>
									{#each movedOrder(g.skills, s.id, -1) as id}<input type="hidden" name="orderedIds" value={id} />{/each}
									<button type="submit" disabled={i === 0 || !!searchTerm} class="disabled:opacity-30" aria-label="Move up">
										<ArrowUp class="h-3 w-3" />
									</button>
								</form>
								<form method="POST" action="?/reorder" use:enhance>
									{#each movedOrder(g.skills, s.id, 1) as id}<input type="hidden" name="orderedIds" value={id} />{/each}
									<button type="submit" disabled={i === g.skills.length - 1 || !!searchTerm} class="disabled:opacity-30" aria-label="Move down">
										<ArrowDown class="h-3 w-3" />
									</button>
								</form>
							</div>
							<div class="flex-1 min-w-[10rem] flex items-center gap-2">
								<span>{s.name}</span>
								{#if s.requiresCertificate}
									<span class="pill pill-outline gap-1"><FileBadge class="h-3 w-3" /> Certificate required</span>
								{/if}
								{#if s.archivedAt}<span class="pill pill-secondary">Archived</span>{/if}
							</div>
							<div class="text-xs text-muted-foreground w-48">
								{s.candidateCount} professional{s.candidateCount === 1 ? '' : 's'} ·
								{s.requisitionCount} requisition{s.requisitionCount === 1 ? '' : 's'}
							</div>
							<div class="flex items-center gap-1">
								<Button variant="ghost" size="sm" on:click={() => openEdit(s)} aria-label="Edit">
									<Edit class="h-4 w-4" />
								</Button>
								<form method="POST" action="?/setArchived" use:enhance>
									<input type="hidden" name="id" value={s.id} />
									<input type="hidden" name="archived" value={s.archivedAt ? 'false' : 'true'} />
									<Button type="submit" variant="ghost" size="sm" aria-label={s.archivedAt ? 'Restore' : 'Archive'}>
										{#if s.archivedAt}<ArchiveRestore class="h-4 w-4" />{:else}<Archive class="h-4 w-4" />{/if}
									</Button>
								</form>
								{#if s.candidateCount === 0 && s.requisitionCount === 0}
									<form method="POST" action="?/deleteSkill" use:enhance>
										<input type="hidden" name="id" value={s.id} />
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
	{/each}
</section>

<Dialog.Root bind:open={dialogOpen}>
	<Dialog.Content class="sm:max-w-[440px]">
		<form
			method="POST"
			action={editing ? '?/editSkill' : '?/addSkill'}
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
				<Dialog.Title>{editing ? 'Edit Skill' : 'Add New Skill'}</Dialog.Title>
			</Dialog.Header>
			{#if editing}<input type="hidden" name="id" value={editing.id} />{/if}
			<div class="space-y-4 py-4">
				<div class="space-y-1">
					<label for="skill-name" class="text-sm font-medium">Name</label>
					<Input id="skill-name" name="name" bind:value={formName} required maxlength={80} />
				</div>
				<div class="space-y-1">
					<label for="skill-category" class="text-sm font-medium">Category</label>
					<select
						id="skill-category"
						name="categoryId"
						bind:value={formCategoryId}
						required
						class="w-full border rounded-md px-2 py-2 text-sm bg-white"
					>
						{#each categories as c (c.id)}
							<option value={c.id} disabled={!!c.archivedAt && c.id !== editing?.categoryId}>
								{c.name}{c.archivedAt ? ' (archived)' : ''}
							</option>
						{/each}
					</select>
				</div>
				<label class="flex items-start gap-2 text-sm">
					<input
						type="checkbox"
						name="requiresCertificate"
						bind:checked={formRequiresCertificate}
						class="mt-1"
					/>
					<span>
						Requires a certificate
						<span class="block text-xs text-muted-foreground">
							The professional must upload a dated certificate linked to this skill. It stops
							counting for matching once that certificate expires.
						</span>
					</span>
				</label>
			</div>
			<Dialog.Footer>
				<Button variant="destructiveOutline" type="button" on:click={() => (dialogOpen = false)}>
					Cancel
				</Button>
				<Button type="submit" class="bg-primary hover:bg-primary/90" disabled={saving}>
					{#if saving}<Loader2 class="mr-2 h-4 w-4 animate-spin" />{/if}
					{editing ? 'Save' : 'Add Skill'}
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
