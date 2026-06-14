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
	import * as Table from '$lib/components/ui/table';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import {
		Dialog,
		DialogClose,
		DialogContent,
		DialogFooter,
		DialogTrigger,
		DialogTitle
	} from '$lib/components/ui/dialog';
	import type { PageData } from './$types';
	import { writable } from 'svelte/store';
	import { onMount } from 'svelte';
	import {
		ArrowUpDown,
		ArrowUp,
		ArrowDown,
		ChevronLeft,
		ChevronRight,
		Shield,
		Plus
	} from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import DialogHeader from '$lib/components/ui/dialog/dialog-header.svelte';
	import { Label } from '$lib/components/ui/label';
	import { superForm } from 'sveltekit-superforms/client';

	export let data: PageData;

	type AdminUserData = {
		id: string;
		firstName: string;
		lastName: string;
		email: string;
		avatarUrl: string;
		role: string;
	};

	let tableData: AdminUserData[] = [];
	let searchTerm = '';
	let dialogOpen = false;
	let userDialogOpen = false;
	let selectedUser = null;

	$: admins = (data.admins as AdminUserData[]) || [];

	// Column definitions
	const columns: ColumnDef<AdminUserData>[] = [
		{
			header: 'Name',
			id: 'name',
			accessorFn: (row) => `${row.lastName}, ${row.firstName}`,
			enableSorting: true,
			sortingFn: (rowA, rowB) => {
				const nameA = `${rowA.original.lastName}, ${rowA.original.firstName}`.toLowerCase();
				const nameB = `${rowB.original.lastName}, ${rowB.original.firstName}`.toLowerCase();
				return nameA.localeCompare(nameB);
			}
		},
		{
			header: 'Email',
			id: 'email',
			accessorKey: 'email',
			enableSorting: true,
			sortingFn: (rowA, rowB) => {
				const emailA = rowA.original.email?.toLowerCase() || '';
				const emailB = rowB.original.email?.toLowerCase() || '';
				return emailA.localeCompare(emailB);
			}
		},
		{
			header: 'Role',
			id: 'role',
			accessorKey: 'role',
			enableSorting: true
		}
	];

	// Table options
	const options = writable<TableOptions<AdminUserData>>({
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

	// Update table data when admins change
	$: {
		tableData = admins;
		options.update((o) => ({ ...o, data: tableData }));
	}

	onMount(() => {
		tableData = admins;
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
			goto('/admin/menu/admins');
		} else {
			goto(`/admin/menu/admins?search=${encodeURIComponent(searchTerm.trim())}`);
		}
	}

	function handleRowClick(adminId: string) {
		goto(`/admin/menu/admins/${adminId}`);
	}

	const { submitting, errors, enhance } = superForm(data.form, {
		onResult: ({ result }) => {
			if (result.type === 'success') {
				dialogOpen = false;
			}
		}
	});
</script>

<section class="flex flex-col h-full p-6 space-y-6">
	<!-- Header -->
	<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Admin Users</h1>
			<p class="text-muted-foreground">Manage system administrators</p>
		</div>

		<Dialog bind:open={dialogOpen}>
			<DialogTrigger asChild>
				<Button on:click={() => (dialogOpen = true)} class="bg-primary hover:bg-primary/90"
					><Plus class="mr-2" size={20} /> Invite Admin</Button
				>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader><DialogTitle>Invite Admin User</DialogTitle></DialogHeader>
				<form use:enhance method="POST" class="space-y-4">
					<div class="space-y-2">
						<Label for="email">User Email</Label>
						<Input name="email" placeholder="Enter user email" />
					</div>
					<DialogFooter>
						<DialogClose asChild
							><Button type="button" on:click={() => (dialogOpen = false)} variant="destructiveOutline"
								>Cancel</Button
							></DialogClose
						>
						<Button class="bg-primary hover:bg-primary/90" type="submit"
							>{#if $submitting}
								Sending...
							{:else}
								Send Invite
							{/if}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	</div>

	<!-- Search -->
	<form on:submit|preventDefault={() => handleSearch(searchTerm)} class="flex items-center gap-2">
		<Input bind:value={searchTerm} placeholder="Search admin users..." class="bg-white max-w-xs" />
		<Button
			size="sm"
			class="bg-primary hover:bg-primary/90"
			on:click={() => handleSearch(searchTerm)}
		>
			Search
		</Button>
	</form>

	<!-- Admin Statistics -->
	<div class="flex items-center gap-4">
		<div class="flex items-center gap-2 text-sm text-muted-foreground">
			<Shield class="h-4 w-4" />
			<span>{admins.length} total administrators</span>
		</div>
	</div>

	<!-- Table -->
	<div class="bg-white rounded-lg shadow-sm flex flex-col">
		{#if $table.getRowModel().rows.length > 0}
			<div class="rounded-md border">
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
								<!-- <Table.Head>Actions</Table.Head> -->
							</Table.Row>
						{/each}
					</Table.Header>
					<Table.Body>
						{#each $table.getRowModel().rows as row}
							<Table.Row
								class="bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer"
								on:click={() => handleRowClick(row.original.id)}
							>
								{#each row.getVisibleCells() as cell}
									<Table.Cell>
										<svelte:component
											this={flexRender(cell.column.columnDef.cell, cell.getContext())}
										/>
									</Table.Cell>
								{/each}
								<!-- <Table.Cell>
									<Button variant="ghost" size="sm">
										<Eye size={16} />
									</Button>
								</Table.Cell> -->
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
					)} of {$table.getRowModel().rows.length} administrators
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
					<Shield class="w-8 h-8 text-gray-400" />
				</div>
				<h3 class="text-lg font-medium text-gray-900 mb-2">No administrators found</h3>
				<p class="text-sm text-gray-500">
					{#if searchTerm}
						Try adjusting your search terms
					{:else}
						No system administrators found
					{/if}
				</p>
			</div>
		{/if}
	</div>
</section>
