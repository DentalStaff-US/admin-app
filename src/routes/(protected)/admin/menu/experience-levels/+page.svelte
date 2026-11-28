<script lang="ts">
	import { enhance as kitEnhance } from '$app/forms';
	import { page } from '$app/state';
	import { Loader2, Plus, Save } from 'lucide-svelte';
	import { superForm } from 'sveltekit-superforms/client';
	import Page from '$dtss/Page.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import {
		TaxonomyConfirmDialog,
		ExperienceLevelsTable,
		TaxonomySearchField,
		type ExperienceLevelRow
	} from '$features/admin/components/taxonomy';

	let { data } = $props();

	let addOpen = $state(false);
	let deleteOpen = $state(false);
	let toDelete = $state<ExperienceLevelRow | null>(null);
	let savingOrder = $state(false);

	const {
		form: addForm,
		errors: addErrors,
		enhance: addEnhance,
		submitting: addSubmitting
	} = superForm(data.form, {
		onResult: ({ result }) => {
			if (result.type === 'success') {
				addOpen = false;
				$addForm = { value: '' };
			}
		}
	});

	const search = $derived(page.url.searchParams.get('search') ?? '');

	// Server data is already sorted by (order, value). A local working copy is
	// reordered in memory; the baseline drives the unsaved-changes check.
	const serverLevels = $derived((data.experienceLevels as ExperienceLevelRow[]) ?? []);
	let levels = $state<ExperienceLevelRow[]>([]);
	$effect(() => {
		levels = [...serverLevels];
	});

	const isDirty = $derived(
		levels.length === serverLevels.length && levels.some((l, i) => l.id !== serverLevels[i]?.id)
	);
	const orderPayload = $derived(JSON.stringify(levels.map((l, i) => ({ id: l.id, order: i }))));

	function move(index: number, delta: -1 | 1) {
		const j = index + delta;
		if (j < 0 || j >= levels.length) return;
		const next = [...levels];
		[next[index], next[j]] = [next[j], next[index]];
		levels = next;
	}

	function openDelete(row: ExperienceLevelRow) {
		toDelete = row;
		deleteOpen = true;
	}
</script>

{#snippet orderBar()}
	<form
		method="POST"
		action="?/reorderExperienceLevels"
		class="flex flex-wrap items-center gap-3"
		use:kitEnhance={() => {
			savingOrder = true;
			return async ({ update }) => {
				await update();
				savingOrder = false;
			};
		}}
	>
		<input type="hidden" name="order" value={orderPayload} />
		<Button type="submit" size="sm" disabled={!isDirty || savingOrder}>
			{#if savingOrder}<Loader2 class="mr-2 size-4 animate-spin" aria-hidden="true" />{:else}<Save class="mr-2 size-4" aria-hidden="true" />{/if}
			Save order
		</Button>
		{#if isDirty}
			<Button variant="outline" size="sm" on:click={() => (levels = [...serverLevels])}>Discard changes</Button>
			<span class="text-sm text-muted-foreground" role="status">Unsaved order changes</span>
		{:else}
			<span class="text-sm text-muted-foreground">Use the arrows to reorder, then save.</span>
		{/if}
	</form>
{/snippet}

<Page>
	<PageHeader title="Experience levels" description="The options professionals choose from, in the order they're shown.">
		{#snippet actions()}
			<Button on:click={() => (addOpen = true)}><Plus class="mr-2 size-4" aria-hidden="true" />Add experience level</Button>
		{/snippet}
	</PageHeader>

	<TaxonomySearchField label="Search experience levels" value={search} />

	<ExperienceLevelsTable
		rows={levels}
		{search}
		toolbar={levels.length > 0 ? orderBar : undefined}
		onMove={move}
		onAdd={() => (addOpen = true)}
		onDelete={openDelete}
	/>
</Page>

<Dialog.Root bind:open={addOpen}>
	<Dialog.Content class="sm:max-w-lg">
		<form method="POST" action="?/addExperienceLevel" use:addEnhance class="space-y-6">
			<Dialog.Header>
				<Dialog.Title class="text-h2">Add experience level</Dialog.Title>
				<Dialog.Description>New levels go to the bottom of the list; reorder them afterwards.</Dialog.Description>
			</Dialog.Header>
			<div class="space-y-1.5">
				<Label for="experience-level-value" class="font-semibold">Name</Label>
				<Input
					id="experience-level-value"
					name="value"
					required
					placeholder="e.g. 3–5 years"
					bind:value={$addForm.value}
					aria-invalid={$addErrors.value ? 'true' : undefined}
				/>
				{#if $addErrors.value}<p class="text-sm text-destructive">{$addErrors.value[0]}</p>{/if}
			</div>
			<Dialog.Footer class="gap-2">
				<Button variant="outline" on:click={() => (addOpen = false)}>Cancel</Button>
				<Button type="submit" disabled={$addSubmitting}>
					{#if $addSubmitting}<Loader2 class="mr-2 size-4 animate-spin" aria-hidden="true" />{/if}
					Add experience level
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<TaxonomyConfirmDialog
	bind:open={deleteOpen}
	title="Delete “{toDelete?.value ?? 'this level'}”?"
	description="The level is removed from the options professionals choose from. This can't be undone."
	action="?/deleteExperienceLevel"
	fields={{ id: toDelete?.id ?? '' }}
	confirmLabel="Delete level"
	confirmText="DELETE"
/>
