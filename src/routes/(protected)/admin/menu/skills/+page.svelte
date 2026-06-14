<script lang="ts">
	import {
		getCoreRowModel,
		type ColumnDef,
		getSortedRowModel,
		getPaginationRowModel,
		getFilteredRowModel,
		type TableOptions,
		createSvelteTable,
		flexRender
	} from '@tanstack/svelte-table';
	import * as Form from '$lib/components/ui/form';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Table from '$lib/components/ui/table';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import type { PageData } from './$types';
	import { writable } from 'svelte/store';
	import { onMount } from 'svelte';
	import { newSkillSchema } from '$lib/config/zod-schemas';
	import {
		Loader2,
		AlertCircle,
		ArrowUpDown,
		ArrowUp,
		ArrowDown,
		Search,
		ChevronLeft,
		ChevronRight,
		Tags,
		PlusIcon,
		Trash
	} from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { superForm } from 'sveltekit-superforms/client';

	export let data: PageData;
	const {
		submitting,
		enhance,
		form: skillForm
	} = superForm(data.form, {
		onResult: ({ result }) => {
			if (result.type === 'success') {
				dialogOpen = false;
				$skillForm = {
					name: '',
					categoryId: ''
				};
			}
		}
	});

	type SkillData = {
		id: string;
		name: string;
		categoryId: string;
		createdAt: Date;
		updatedAt: Date;
		categoryName: string;
	};

	let tableData: SkillData[] = [];
	let searchTerm = '';
	let dialogOpen = false;

	$: skills = (data.skills as SkillData[]) || [];
	$: categories = data.categories || [];

	// Column definitions
	const columns: ColumnDef<SkillData>[] = [
		{
			header: 'Skill Name',
			id: 'name',
			accessorKey: 'name',
			enableSorting: true,
			sortingFn: (rowA, rowB) => {
				const nameA = rowA.original.name?.toLowerCase() || '';
				const nameB = rowB.original.name?.toLowerCase() || '';
				return nameA.localeCompare(nameB);
			}
		},
		{
			header: 'Category',
			id: 'categoryName',
			accessorKey: 'categoryName',
			enableSorting: true,
			sortingFn: (rowA, rowB) => {
				const categoryA = rowA.original.categoryName?.toLowerCase() || '';
				const categoryB = rowB.original.categoryName?.toLowerCase() || '';
				return categoryA.localeCompare(categoryB);
			}
		},
		{
			header: 'Created',
			id: 'createdAt',
			accessorKey: 'createdAt',
			enableSorting: true,
			sortingFn: (rowA, rowB) => {
				const dateA = new Date(rowA.original.createdAt).getTime();
				const dateB = new Date(rowB.original.createdAt).getTime();
				return dateA - dateB;
			},
			cell: ({ getValue }) => {
				const date = getValue() as Date;
				return new Date(date).toLocaleDateString();
			}
		}
	];

	// Table options
	const options = writable<TableOptions<SkillData>>({
		data: tableData,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		initialState: {
			pagination: {
				pageSize: 10
			}
		}
	});

	// Update table data when skills change
	$: {
		tableData = skills;
		options.update((o) => ({ ...o, data: tableData }));
	}

	onMount(() => {
		tableData = skills;
		options.update((o) => ({ ...o, data: tableData }));
	});

	const table = createSvelteTable(options);

	function getSortingIcon(header: any) {
		if (!header.column.getCanSort()) return null;

		const sorted = header.column.getIsSorted();
		if (sorted === 'asc') return ArrowUp;
		if (sorted === 'desc') return ArrowDown;
		return ArrowUpDown;
	}

	// Group skills by category for display purposes
	$: categoryCounts = skills.reduce(
		(acc, skill) => {
			acc[skill.categoryName] = (acc[skill.categoryName] || 0) + 1;
			return acc;
		},
		{} as Record<string, number>
	);

	function handleSearch(searchTerm: string) {
		if (!searchTerm || searchTerm.trim() === '') {
			goto('/admin/menu/skills');
		} else {
			goto(`/admin/menu/skills?search=${encodeURIComponent(searchTerm.trim())}`);
		}
	}
</script>

<section class="flex flex-col h-full p-6 space-y-6">
	<!-- Header -->
	<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Skills</h1>
			<p class="text-muted-foreground">Manage skills and their categories</p>
		</div>

		<Dialog.Root bind:open={dialogOpen}>
			<Dialog.Trigger asChild>
				<Button on:click={() => (dialogOpen = true)} class="bg-primary hover:bg-primary/90"
					><PlusIcon size={20} class="mr-2" />Add New Skill</Button
				>
			</Dialog.Trigger>
			<Dialog.Content class="sm:max-w-[425px]">
				<form use:enhance method="POST" action="?/addSkill">
					<Dialog.Header>
						<Dialog.Title>Add New Skill</Dialog.Title>
						<Dialog.Description>
							Add new skill name and select related skill category
						</Dialog.Description>
					</Dialog.Header>
					<div class="space-y-4 py-4">
						<Form.Field config={{ form: superForm(data.form), schema: newSkillSchema }} name="name">
							<Form.Item>
								<Form.Label>Skill Name</Form.Label>
								<Form.Input required />
								<Form.Validation />
							</Form.Item>
						</Form.Field>
						<Form.Field
							config={{ form: superForm(data.form), schema: newSkillSchema }}
							name="categoryId"
						>
							<Form.Item>
								<Form.Label>Skill Category</Form.Label>
								<Form.Select required>
									<Form.SelectTrigger placeholder="Select Category"></Form.SelectTrigger>
									<Form.SelectContent class="max-h-[150px] overflow-y-scroll">
										{#each categories as category}
											<Form.SelectItem value={category.id} label={category.name}>
												{category.name}
											</Form.SelectItem>
										{/each}
									</Form.SelectContent>
								</Form.Select>
								<Form.Validation />
							</Form.Item>
						</Form.Field>
					</div>
					<Dialog.Footer>
						<Button variant="destructiveOutline" type="button" on:click={() => (dialogOpen = false)}>
							Cancel
						</Button>
						<Form.Button disabled={$submitting}>
							{#if $submitting}
								<Loader2 class="mr-2 h-4 w-4 animate-spin" />
							{/if}
							Add Skill
						</Form.Button>
					</Dialog.Footer>
				</form>
			</Dialog.Content>
		</Dialog.Root>
	</div>

	<!-- Search and Stats -->
	<form on:submit|preventDefault={() => handleSearch(searchTerm)} class="flex items-center gap-2">
		<Input bind:value={searchTerm} placeholder="Search skills..." class="bg-white max-w-xs" />
		<Button
			size="sm"
			class="bg-primary hover:bg-primary/90"
			on:click={() => handleSearch(searchTerm)}>Search</Button
		>
	</form>

	<div class="flex flex-wrap gap-2">
		{#each Object.entries(categoryCounts) as [categoryName, count]}
			<Badge variant="secondary" class="text-xs" value={`${categoryName}: ${count}`}></Badge>
		{/each}
	</div>

	<!-- Table -->
	<div class="bg-white rounded-lg shadow-sm flex-1 flex flex-col">
		{#if $table.getFilteredRowModel().rows.length > 0}
			<div class="rounded-md border flex-1">
				<Table.Root>
					<Table.Header>
						{#each $table.getHeaderGroups() as headerGroup}
							<Table.Row class="bg-white">
								{#each headerGroup.headers as header}
									<Table.Head>
										{#if header.column.columnDef.header}
											<Button
												variant="ghost"
												on:click={() =>
													header.column.toggleSorting(header.column.getIsSorted() === 'asc')}
												class="hover:bg-gray-50"
											>
												{header.column.columnDef.header}
												{#if header.column.getCanSort()}
													{#if getSortingIcon(header)}
														<svelte:component this={getSortingIcon(header)} class="ml-2 h-4 w-4" />
													{/if}
												{/if}
											</Button>
										{/if}
									</Table.Head>
								{/each}
								<Table.Head></Table.Head>
							</Table.Row>
						{/each}
					</Table.Header>
					<Table.Body>
						{#each $table.getRowModel().rows as row}
							<Table.Row class="bg-gray-50 hover:bg-gray-100 transition-colors">
								{#each row.getVisibleCells() as cell}
									<Table.Cell>
										<svelte:component
											this={flexRender(cell.column.columnDef.cell, cell.getContext())}
										/>
									</Table.Cell>
								{/each}
								<Table.Cell>
									<form method="POST" use:enhance action="?/deleteCategory">
										<Button formaction="?/deleteSkill" type="submit" variant="destructive" size="sm"
											><Trash size={16} /></Button
										>
										<input type="hidden" name="id" bind:value={row.original.id} />
									</form>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>

			<!-- Pagination -->
			<div class="flex items-center justify-between space-x-2 p-4 border-t">
				<div class="flex-1 text-sm text-muted-foreground">
					Showing {$table.getState().pagination.pageIndex * $table.getState().pagination.pageSize +
						1} to {Math.min(
						($table.getState().pagination.pageIndex + 1) * $table.getState().pagination.pageSize,
						$table.getFilteredRowModel().rows.length
					)} of {$table.getFilteredRowModel().rows.length} skills
				</div>
				<div class="flex items-center space-x-2">
					<Button
						variant="outline"
						size="sm"
						on:click={() => $table.previousPage()}
						disabled={!$table.getCanPreviousPage()}
					>
						<ChevronLeft class="h-4 w-4" />
						Previous
					</Button>
					<div class="flex items-center space-x-1">
						<span class="text-sm text-muted-foreground">
							Page {$table.getState().pagination.pageIndex + 1} of {$table.getPageCount()}
						</span>
					</div>
					<Button
						variant="outline"
						size="sm"
						on:click={() => $table.nextPage()}
						disabled={!$table.getCanNextPage()}
					>
						Next
						<ChevronRight class="h-4 w-4" />
					</Button>
				</div>
			</div>
		{:else}
			<!-- Empty state -->
			<div class="flex flex-col items-center justify-center py-12 text-center flex-1">
				<div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
					<Tags class="w-8 h-8 text-gray-400" />
				</div>
				<h3 class="text-lg font-medium text-gray-900 mb-2">No skills found</h3>
				<p class="text-sm text-gray-500 mb-6">
					{#if searchTerm}
						Try adjusting your search terms
					{:else}
						Get started by creating your first skill
					{/if}
				</p>
				{#if !searchTerm}
					<Button on:click={() => (dialogOpen = true)}>Add Your First Skill</Button>
				{/if}
			</div>
		{/if}
	</div>
</section>
