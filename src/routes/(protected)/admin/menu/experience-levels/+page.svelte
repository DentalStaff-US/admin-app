<script lang="ts">
	import * as Form from '$lib/components/ui/form';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import type { PageData } from './$types';
	import { newExperienceLevelSchema } from '$lib/config/zod-schemas';
	import {
		Loader2,
		Search,
		Trophy,
		PlusIcon,
		Trash,
		ArrowUp,
		ArrowDown,
		Save
	} from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { enhance as kitEnhance } from '$app/forms';
	import { superForm } from 'sveltekit-superforms/client';

	export let data: PageData;

	const {
		submitting,
		enhance,
		form: experienceLevelForm
	} = superForm(data.form, {
		onResult: ({ result }) => {
			if (result.type === 'success') {
				dialogOpen = false;
				$experienceLevelForm = {
					value: ''
				};
			}
		}
	});

	type ExperienceLevelData = {
		id: string;
		value: string;
		order: number;
		createdAt: Date;
		updatedAt: Date;
	};

	let searchTerm = '';
	let dialogOpen = false;
	let savingOrder = false;

	// Server data is already sorted by (order, value). Keep a local working copy
	// for in-memory reordering and a baseline for the dirty check.
	let levels: ExperienceLevelData[] = [];
	let originalOrderIds: string[] = [];

	$: serverLevels = (data.experienceLevels as ExperienceLevelData[]) || [];
	$: {
		levels = [...serverLevels];
		originalOrderIds = serverLevels.map((l) => l.id);
	}

	$: isDirty =
		levels.length === originalOrderIds.length &&
		levels.some((l, i) => l.id !== originalOrderIds[i]);

	function moveUp(idx: number) {
		if (idx <= 0) return;
		const next = [...levels];
		[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
		levels = next;
	}

	function moveDown(idx: number) {
		if (idx >= levels.length - 1) return;
		const next = [...levels];
		[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
		levels = next;
	}

	function resetOrder() {
		levels = [...serverLevels];
	}

	// Build the JSON payload reflecting current visual order.
	$: orderPayload = JSON.stringify(levels.map((l, i) => ({ id: l.id, order: i })));

	function handleSearch(searchTerm: string) {
		if (!searchTerm || searchTerm.trim() === '') {
			goto('/admin/menu/experience-levels');
		} else {
			goto(`/admin/menu/experience-levels?search=${encodeURIComponent(searchTerm.trim())}`);
		}
	}
</script>

<section class="flex flex-col h-full p-6 space-y-6">
	<!-- Header -->
	<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Experience Levels</h1>
			<p class="text-muted-foreground">
				Manage experience level options. Use the arrows to reorder; click Save Order to persist.
			</p>
		</div>

		<Dialog.Root bind:open={dialogOpen}>
			<Dialog.Trigger asChild>
				<Button on:click={() => (dialogOpen = true)} class="bg-blue-800 hover:bg-blue-900">
					<PlusIcon size={20} class="mr-2" />Add New Experience Level
				</Button>
			</Dialog.Trigger>
			<Dialog.Content class="sm:max-w-[425px]">
				<form use:enhance method="POST" action="?/addExperienceLevel">
					<Dialog.Header>
						<Dialog.Title>Add New Experience Level</Dialog.Title>
						<Dialog.Description>
							Add a new experience level option for professionals. New levels are appended to the
							bottom — reorder afterward with the arrows.
						</Dialog.Description>
					</Dialog.Header>
					<div class="space-y-4 py-4">
						<Form.Field
							config={{ form: superForm(data.form), schema: newExperienceLevelSchema }}
							name="value"
						>
							<Form.Item>
								<Form.Label>Experience Level Value</Form.Label>
								<Form.Input required placeholder="e.g., Entry Level, Mid Level, Senior..." />
								<Form.Validation />
							</Form.Item>
						</Form.Field>
					</div>
					<Dialog.Footer>
						<Button variant="outline" type="button" on:click={() => (dialogOpen = false)}>
							Cancel
						</Button>
						<Form.Button disabled={$submitting}>
							{#if $submitting}
								<Loader2 class="mr-2 h-4 w-4 animate-spin" />
							{/if}
							Add Experience Level
						</Form.Button>
					</Dialog.Footer>
				</form>
			</Dialog.Content>
		</Dialog.Root>
	</div>

	<!-- Search -->
	<form on:submit|preventDefault={() => handleSearch(searchTerm)} class="flex items-center gap-2">
		<Input
			bind:value={searchTerm}
			placeholder="Search experience levels..."
			class="bg-white max-w-xs"
		/>
		<Button
			size="sm"
			class="bg-blue-800 hover:bg-blue-900"
			on:click={() => handleSearch(searchTerm)}
		>
			<Search size={16} class="mr-2" />
			Search
		</Button>
	</form>

	<!-- Reorder bar -->
	{#if levels.length > 0}
		<div class="flex items-center gap-2">
			<form
				method="POST"
				action="?/reorderExperienceLevels"
				use:kitEnhance={() => {
					savingOrder = true;
					return async ({ update }) => {
						await update();
						savingOrder = false;
					};
				}}
			>
				<input type="hidden" name="order" value={orderPayload} />
				<Button
					type="submit"
					disabled={!isDirty || savingOrder}
					class="bg-blue-800 hover:bg-blue-900"
				>
					{#if savingOrder}
						<Loader2 class="mr-2 h-4 w-4 animate-spin" />
					{:else}
						<Save size={16} class="mr-2" />
					{/if}
					Save Order
				</Button>
			</form>
			{#if isDirty}
				<Button variant="outline" size="sm" on:click={resetOrder}>Discard changes</Button>
				<span class="text-sm text-muted-foreground">Unsaved order changes</span>
			{/if}
		</div>
	{/if}

	<!-- List -->
	<div class="bg-white rounded-lg shadow-sm flex-1 flex flex-col">
		{#if levels.length > 0}
			<ul class="divide-y rounded-md border">
				{#each levels as level, idx (level.id)}
					<li class="flex items-center gap-3 p-3 bg-gray-50 hover:bg-gray-100 transition-colors">
						<div class="flex flex-col gap-1">
							<Button
								type="button"
								variant="outline"
								size="sm"
								class="h-7 w-7 p-0"
								disabled={idx === 0}
								on:click={() => moveUp(idx)}
								aria-label="Move up"
							>
								<ArrowUp size={14} />
							</Button>
							<Button
								type="button"
								variant="outline"
								size="sm"
								class="h-7 w-7 p-0"
								disabled={idx === levels.length - 1}
								on:click={() => moveDown(idx)}
								aria-label="Move down"
							>
								<ArrowDown size={14} />
							</Button>
						</div>
						<div class="flex-1">
							<p class="font-medium">{level.value}</p>
							<p class="text-xs text-muted-foreground">
								Position {idx + 1} · Created {new Date(level.createdAt).toLocaleDateString()}
							</p>
						</div>
						<form method="POST" use:enhance action="?/deleteExperienceLevel">
							<input type="hidden" name="id" value={level.id} />
							<Button type="submit" variant="destructive" size="sm" aria-label="Delete">
								<Trash size={14} />
							</Button>
						</form>
					</li>
				{/each}
			</ul>
		{:else}
			<!-- Empty state -->
			<div class="flex flex-col items-center justify-center py-12 text-center flex-1">
				<div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
					<Trophy class="w-8 h-8 text-gray-400" />
				</div>
				<h3 class="text-lg font-medium text-gray-900 mb-2">No experience levels found</h3>
				<p class="text-sm text-gray-500 mb-6">
					{#if searchTerm}
						Try adjusting your search terms
					{:else}
						Get started by creating your first experience level
					{/if}
				</p>
				{#if !searchTerm}
					<Button on:click={() => (dialogOpen = true)}>Add Your First Experience Level</Button>
				{/if}
			</div>
		{/if}
	</div>
</section>
