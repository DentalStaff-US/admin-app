<script lang="ts">
	import {
		getCoreRowModel,
		type ColumnDef,
		getSortedRowModel,
		getPaginationRowModel,
		type TableOptions,
		createSvelteTable,
		flexRender
	} from '@tanstack/svelte-table';
	import * as Form from '$lib/components/ui/form';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Table from '$lib/components/ui/table';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import type { PageData } from './$types';
	import { writable } from 'svelte/store';
	import { onMount } from 'svelte';
	import {
		newDisciplineSchema,
		editDisciplineSchema,
		deleteDisciplineSchema
	} from '$lib/config/zod-schemas';
	import {
		Loader2,
		ArrowUpDown,
		ArrowUp,
		ArrowDown,
		ChevronLeft,
		ChevronRight,
		GraduationCap,
		PlusIcon,
		Trash,
		Pencil
	} from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { superForm } from 'sveltekit-superforms/client';

	export let data: PageData;

	// Add form
	const {
		submitting,
		enhance,
		form: disciplineForm
	} = superForm(data.form, {
		onResult: ({ result }) => {
			if (result.type === 'success') {
				dialogOpen = false;
				$disciplineForm = { name: '', abbreviation: '', workersCompCode: '' };
			}
		}
	});

	// Edit form
	const {
		submitting: editSubmitting,
		enhance: editEnhance,
		form: editDisciplineForm
	} = superForm(data.editForm, {
		onResult: ({ result }) => {
			if (result.type === 'success') {
				editDialogOpen = false;
			}
		}
	});

	// Delete form
	const {
		submitting: deleteSubmitting,
		enhance: deleteEnhance,
		form: deleteDisciplineForm
	} = superForm(data.deleteForm, {
		onResult: ({ result }) => {
			if (result.type === 'success') {
				deleteDialogOpen = false;
			}
		}
	});

	type DisciplineData = {
		id: string;
		name: string;
		abbreviation: string;
		workersCompCode: string | null;
		createdAt: Date;
		updatedAt: Date;
	};

	let disciplineToEdit: DisciplineData | null = null;
	let disciplineToDelete: DisciplineData | null = null;

	let tableData: DisciplineData[] = [];
	let searchTerm = '';
	let dialogOpen = false;
	let editDialogOpen = false;
	let deleteDialogOpen = false;

	$: disciplines = (data.disciplines as DisciplineData[]) || [];

	function openEditDialog(discipline: DisciplineData) {
		disciplineToEdit = discipline;
		$editDisciplineForm = {
			id: discipline.id,
			name: discipline.name,
			abbreviation: discipline.abbreviation,
			workersCompCode: discipline.workersCompCode ?? ''
		};
		editDialogOpen = true;
	}

	function openDeleteDialog(discipline: DisciplineData) {
		disciplineToDelete = discipline;
		$deleteDisciplineForm = { id: discipline.id };
		deleteDialogOpen = true;
	}

	const columns: ColumnDef<DisciplineData>[] = [
		{
			header: 'Discipline Name',
			id: 'name',
			accessorKey: 'name',
			enableSorting: true,
			sortingFn: (rowA, rowB) =>
				(rowA.original.name?.toLowerCase() || '').localeCompare(
					rowB.original.name?.toLowerCase() || ''
				)
		},
		{
			header: 'Abbreviation',
			id: 'abbreviation',
			accessorKey: 'abbreviation',
			enableSorting: true,
			sortingFn: (rowA, rowB) =>
				(rowA.original.abbreviation?.toLowerCase() || '').localeCompare(
					rowB.original.abbreviation?.toLowerCase() || ''
				)
		},
		{
			header: "Workers' Comp Code",
			id: 'workersCompCode',
			accessorKey: 'workersCompCode',
			enableSorting: true,
			sortingFn: (rowA, rowB) =>
				(rowA.original.workersCompCode?.toLowerCase() || '').localeCompare(
					rowB.original.workersCompCode?.toLowerCase() || ''
				),
			cell: ({ getValue }) => (getValue() as string) || '—'
		},
		{
			header: 'Created',
			id: 'createdAt',
			accessorKey: 'createdAt',
			enableSorting: true,
			sortingFn: (rowA, rowB) =>
				new Date(rowA.original.createdAt).getTime() - new Date(rowB.original.createdAt).getTime(),
			cell: ({ getValue }) => new Date(getValue() as Date).toLocaleDateString()
		},
		{
			header: 'Updated',
			id: 'updatedAt',
			accessorKey: 'updatedAt',
			enableSorting: true,
			sortingFn: (rowA, rowB) =>
				new Date(rowA.original.updatedAt).getTime() - new Date(rowB.original.updatedAt).getTime(),
			cell: ({ getValue }) => new Date(getValue() as Date).toLocaleDateString()
		}
	];

	const options = writable<TableOptions<DisciplineData>>({
		data: tableData,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		initialState: { pagination: { pageSize: 10 } }
	});

	$: {
		tableData = disciplines;
		options.update((o) => ({ ...o, data: tableData }));
	}

	onMount(() => {
		tableData = disciplines;
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

	function handleSearch(searchTerm: string) {
		if (!searchTerm || searchTerm.trim() === '') {
			goto('/admin/menu/disciplines');
		} else {
			goto(`/admin/menu/disciplines?search=${encodeURIComponent(searchTerm.trim())}`);
		}
	}
</script>

<section class="flex flex-col h-full p-6 space-y-6">
	<!-- Header -->
	<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Disciplines</h1>
			<p class="text-muted-foreground">Manage professional disciplines and specialties</p>
		</div>
		<Button on:click={() => (dialogOpen = true)} class="bg-blue-800 hover:bg-blue-900">
			<PlusIcon size={20} class="mr-2" />Add New Discipline
		</Button>
	</div>

	<!-- Search -->
	<form on:submit|preventDefault={() => handleSearch(searchTerm)} class="flex items-center gap-2">
		<Input bind:value={searchTerm} placeholder="Search disciplines..." class="bg-white max-w-xs" />
		<Button
			size="sm"
			class="bg-blue-800 hover:bg-blue-900"
			on:click={() => handleSearch(searchTerm)}
		>
			Search
		</Button>
	</form>

	<!-- Table -->
	<div class="bg-white rounded-lg shadow-sm flex-1 flex flex-col">
		{#if $table.getRowModel().rows.length > 0}
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
								<Table.Head>Actions</Table.Head>
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
									<div class="flex items-center gap-2">
										<Button
											variant="outline"
											size="sm"
											on:click={() => openEditDialog(row.original)}
										>
											<Pencil size={16} />
										</Button>
										<Button
											variant="destructive"
											size="sm"
											on:click={() => openDeleteDialog(row.original)}
										>
											<Trash size={16} />
										</Button>
									</div>
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
						$table.getRowModel().rows.length
					)} of {$table.getRowModel().rows.length} disciplines
				</div>
				<div class="flex items-center space-x-2">
					<Button
						variant="outline"
						size="sm"
						on:click={() => $table.previousPage()}
						disabled={!$table.getCanPreviousPage()}
					>
						<ChevronLeft class="h-4 w-4" /> Previous
					</Button>
					<span class="text-sm text-muted-foreground">
						Page {$table.getState().pagination.pageIndex + 1} of {$table.getPageCount()}
					</span>
					<Button
						variant="outline"
						size="sm"
						on:click={() => $table.nextPage()}
						disabled={!$table.getCanNextPage()}
					>
						Next <ChevronRight class="h-4 w-4" />
					</Button>
				</div>
			</div>
		{:else}
			<div class="flex flex-col items-center justify-center py-12 text-center flex-1">
				<div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
					<GraduationCap class="w-8 h-8 text-gray-400" />
				</div>
				<h3 class="text-lg font-medium text-gray-900 mb-2">No disciplines found</h3>
				<p class="text-sm text-gray-500 mb-6">
					{#if searchTerm}
						Try adjusting your search terms
					{:else}
						Get started by creating your first discipline
					{/if}
				</p>
				{#if !searchTerm}
					<Button on:click={() => (dialogOpen = true)}>Add Your First Discipline</Button>
				{/if}
			</div>
		{/if}
	</div>
</section>

<!-- Add Discipline Dialog -->
<Dialog.Root bind:open={dialogOpen}>
	<Dialog.Content class="sm:max-w-[425px]">
		<form use:enhance method="POST" action="?/addDiscipline">
			<Dialog.Header>
				<Dialog.Title>Add New Discipline</Dialog.Title>
				<Dialog.Description>Add a new professional discipline or specialty area</Dialog.Description>
			</Dialog.Header>
			<div class="space-y-4 py-4">
				<Form.Field
					config={{ form: superForm(data.form), schema: newDisciplineSchema }}
					name="name"
				>
					<Form.Item>
						<Form.Label>Discipline Name</Form.Label>
						<Form.Input required placeholder="e.g., Dental Hygienist, Dentist..." />
						<Form.Validation />
					</Form.Item>
				</Form.Field>
				<Form.Field
					config={{ form: superForm(data.form), schema: newDisciplineSchema }}
					name="abbreviation"
				>
					<Form.Item>
						<Form.Label>Abbreviation</Form.Label>
						<Form.Input required placeholder="e.g., DH, DDS, RDA..." />
						<Form.Validation />
					</Form.Item>
				</Form.Field>
				<Form.Field
					config={{ form: superForm(data.form), schema: newDisciplineSchema }}
					name="workersCompCode"
				>
					<Form.Item>
						<Form.Label>Workers' Comp Code</Form.Label>
						<Form.Input placeholder="e.g., 8021..." />
						<Form.Validation />
					</Form.Item>
				</Form.Field>
			</div>
			<Dialog.Footer>
				<Button variant="outline" type="button" on:click={() => (dialogOpen = false)}>Cancel</Button
				>
				<Form.Button disabled={$submitting}>
					{#if $submitting}<Loader2 class="mr-2 h-4 w-4 animate-spin" />{/if}
					Add Discipline
				</Form.Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<!-- Edit Discipline Dialog -->
<Dialog.Root bind:open={editDialogOpen}>
	<Dialog.Content class="sm:max-w-[425px]">
		<form use:editEnhance method="POST" action="?/editDiscipline">
			<Dialog.Header>
				<Dialog.Title>Edit Discipline</Dialog.Title>
				<Dialog.Description>Update the details for this discipline</Dialog.Description>
			</Dialog.Header>
			<div class="space-y-4 py-4">
				<input type="hidden" name="id" value={$editDisciplineForm.id} />
				<Form.Field
					config={{ form: superForm(data.editForm), schema: editDisciplineSchema }}
					name="name"
				>
					<Form.Item>
						<Form.Label>Discipline Name</Form.Label>
						<Form.Input
							bind:value={$editDisciplineForm.name}
							placeholder="e.g., Dental Hygienist, Dentist..."
						/>
						<Form.Validation />
					</Form.Item>
				</Form.Field>
				<Form.Field
					config={{ form: superForm(data.editForm), schema: editDisciplineSchema }}
					name="abbreviation"
				>
					<Form.Item>
						<Form.Label>Abbreviation</Form.Label>
						<Form.Input
							bind:value={$editDisciplineForm.abbreviation}
							placeholder="e.g., DH, DDS, RDA..."
						/>
						<Form.Validation />
					</Form.Item>
				</Form.Field>
				<Form.Field
					config={{ form: superForm(data.editForm), schema: editDisciplineSchema }}
					name="workersCompCode"
				>
					<Form.Item>
						<Form.Label>Workers' Comp Code</Form.Label>
						<Form.Input
							bind:value={$editDisciplineForm.workersCompCode}
							placeholder="e.g., 8021..."
						/>
						<Form.Validation />
					</Form.Item>
				</Form.Field>
			</div>
			<Dialog.Footer>
				<Button variant="outline" type="button" on:click={() => (editDialogOpen = false)}
					>Cancel</Button
				>
				<Form.Button disabled={$editSubmitting}>
					{#if $editSubmitting}<Loader2 class="mr-2 h-4 w-4 animate-spin" />{/if}
					Save Changes
				</Form.Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<!-- Delete Discipline Dialog -->
<Dialog.Root bind:open={deleteDialogOpen}>
	<Dialog.Content class="sm:max-w-[425px]">
		<form use:deleteEnhance method="POST" action="?/deleteDiscipline">
			<Dialog.Header>
				<Dialog.Title>Delete Discipline</Dialog.Title>
				<Dialog.Description>
					Are you sure you want to delete <strong>{disciplineToDelete?.name}</strong>? This action
					cannot be undone.
				</Dialog.Description>
			</Dialog.Header>
			<input type="hidden" name="id" value={$deleteDisciplineForm.id} />
			<Dialog.Footer class="pt-4">
				<Button variant="outline" type="button" on:click={() => (deleteDialogOpen = false)}
					>Cancel</Button
				>
				<Form.Button variant="destructive" disabled={$deleteSubmitting}>
					{#if $deleteSubmitting}<Loader2 class="mr-2 h-4 w-4 animate-spin" />{/if}
					Delete
				</Form.Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
