<script lang="ts">
	import type { PageData } from './$types';
	import {
		ArrowUpDown,
		ArrowUp,
		ArrowDown,
		Search,
		Users,
		ChevronLeft,
		ChevronRight,
		Plus
	} from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { writable } from 'svelte/store';
	import * as Table from '$lib/components/ui/table';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { onMount } from 'svelte';
	import ViewLink from '$lib/components/tables/ViewLink.svelte';
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
	import * as Dialog from '$lib/components/ui/dialog';
	import { superForm } from 'sveltekit-superforms/client';
	import { Label } from '$lib/components/ui/label';
	import type { AdminNewUserSchema } from '$lib/config/zod-schemas';

	export let data: PageData;
	$: newProfileForm = data.newProfileForm;

	const { form, errors, submitting, enhance } = superForm<AdminNewUserSchema>(newProfileForm, {
		onResult: ({ result }) => {
			console.log('Form result:', result);
			if (result.type === 'success') {
				addDialogOpen = false;
			}
		}
	});

	type ClientData = {
		user: {
			email: string;
			id: string;
			firstName: string;
			lastName: string;
			avatarUrl: string | null;
		};
		profile: {
			id: string;
			userId: string;
			createdAt: Date;
			updatedAt: Date;
			birthday: string | null;
		};
		company: {
			companyName: string;
			id: string;
			createdAt: Date;
			updatedAt: Date;
			operatingHours: Record<string, any>;
			licenseNumber: string | null;
			companyLogo: string | null;
			companyDescription: string | null;
			baseLocation: string | null;
		};
	};

	let tableData: ClientData[] = [];
	let searchTerm = '';
	let addDialogOpen = false;

	$: clients = (data.clients as ClientData[]) || [];

	// Column definitions
	const columns: ColumnDef<ClientData>[] = [
		{
			header: 'Name',
			id: 'name',
			accessorFn: (row) => `${row.user.lastName}, ${row.user.firstName}`,
			enableSorting: true
		},
		{
			header: 'Company Name',
			id: 'companyName',
			accessorFn: (row) => row.company.companyName || 'No Company',
			enableSorting: true
		},
		{
			header: 'Email',
			id: 'email',
			accessorFn: (row) => row.user.email,
			enableSorting: true
		},
		{
			header: 'Created',
			id: 'createdAt',
			accessorFn: (row) => row.profile.createdAt,
			enableSorting: true,
			cell: ({ getValue }) => {
				const date = getValue() as Date;
				return new Date(date).toLocaleDateString();
			}
		}
	];

	// Table options
	const options = writable<TableOptions<ClientData>>({
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

	// Update table data when clients change
	$: {
		tableData = clients;
		options.update((o) => ({ ...o, data: tableData }));
	}

	onMount(() => {
		tableData = clients;
		options.update((o) => ({ ...o, data: tableData }));
	});

	const table = createSvelteTable(options);

	function handleSearch(searchTerm: string) {
		if (!searchTerm || searchTerm.trim() === '') {
			goto('/clients');
		} else {
			goto(`/clients?search=${encodeURIComponent(searchTerm.trim())}`);
		}
	}

	function handleRowClick(clientId: string) {
		goto(`/clients/${clientId}`);
	}
</script>

<section class="grow h-screen overflow-y-auto mx-auto px-4 py-6 container flex flex-col gap-6">
	<!-- Header -->
	<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Clients</h1>
			<p class="text-muted-foreground">Manage client profiles and companies</p>
		</div>
	</div>

	<div class="flex justify-between flex-wrap items-center">
		<!-- Search -->
		<form on:submit|preventDefault={() => handleSearch(searchTerm)} class="flex items-center gap-2">
			<Input bind:value={searchTerm} placeholder="Search clients..." class="bg-white max-w-xs" />
			<Button
				size="sm"
				class="bg-blue-800 hover:bg-blue-900"
				on:click={() => handleSearch(searchTerm)}
				>Search
			</Button>
		</form>
		<Button class="bg-blue-800 hover:bg-blue-900 gap-2" on:click={() => (addDialogOpen = true)}
			><Plus />Add Client</Button
		>
	</div>

	<!-- Table -->
	<div class="bg-white rounded-lg shadow-sm flex flex-col">
		{#if $table.getFilteredRowModel().rows.length > 0}
			<div class="rounded-md border flex-1">
				<Table.Root>
					<Table.TableHeader>
						{#each $table.getHeaderGroups() as headerGroup}
							<Table.TableRow class="bg-white">
								{#each headerGroup.headers as header}
									<Table.TableHead>
										{#if header.column.columnDef.header}
											<Button
												variant="ghost"
												on:click={() =>
													header.column.toggleSorting(header.column.getIsSorted() === 'asc')}
											>
												{header.column.columnDef.header}
												{#if header.column.getCanSort()}
													<ArrowUpDown class="ml-2 h-4 w-4" />
												{/if}
											</Button>
										{/if}
									</Table.TableHead>
								{/each}
							</Table.TableRow>
						{/each}
					</Table.TableHeader>
					<Table.TableBody>
						{#each $table.getRowModel().rows as row}
							<Table.TableRow
								class="bg-gray-50 hover:bg-gray-100 cursor-pointer transition-colors"
								on:click={() => handleRowClick(row.original.profile.id)}
							>
								{#each row.getVisibleCells() as cell}
									<Table.TableCell>
										<svelte:component
											this={flexRender(cell.column.columnDef.cell, cell.getContext())}
										/>
									</Table.TableCell>
								{/each}
							</Table.TableRow>
						{/each}
					</Table.TableBody>
				</Table.Root>
			</div>

			<!-- Pagination -->
			<div class="flex items-center justify-between space-x-2 p-4 border-t">
				<div class="flex-1 text-sm text-muted-foreground">
					Showing {$table.getState().pagination.pageIndex * $table.getState().pagination.pageSize +
						1} to {Math.min(
						($table.getState().pagination.pageIndex + 1) * $table.getState().pagination.pageSize,
						$table.getFilteredRowModel().rows.length
					)} of {$table.getFilteredRowModel().rows.length} clients
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
					<Users class="w-8 h-8 text-gray-400" />
				</div>
				<h3 class="text-lg font-medium text-gray-900 mb-2">No clients found</h3>
				<p class="text-sm text-gray-500">
					{#if searchTerm}
						Try adjusting your search terms
					{:else}
						No client profiles available
					{/if}
				</p>
			</div>
		{/if}
	</div>
</section>

<Dialog.Root bind:open={addDialogOpen}>
	<Dialog.Content class="space-y-4">
		<form use:enhance method="POST" action="?/adminCreateClient" class="space-y-4">
			<Dialog.Header>
				<Dialog.Title>Add New Client</Dialog.Title>
				<Dialog.Description>
					Will generate user account so email must be unique and not currently in use. Add
					additional profile information on the next step.
				</Dialog.Description>
			</Dialog.Header>
			<div class="grid grid-cols-2 gap-4 relative">
				<div class="col-span-2 md:col-span-1 space-y-2">
					<Label for="firstName">First Name</Label>
					<Input bind:value={$form.firstName} name="firstName" type="text" />
					{#if $errors.firstName}
						<p class="text-red-500 text-xs">{$errors.firstName}</p>
					{/if}
				</div>
				<div class="col-span-2 md:col-span-1 space-y-2">
					<Label for="lastName">Last Name</Label>
					<Input bind:value={$form.lastName} name="lastName" type="text" />
					{#if $errors.lastName}
						<p class="text-red-500 text-xs">{$errors.lastName}</p>
					{/if}
				</div>
				<div class="col-span-2 space-y-2">
					<Label for="email">Email</Label>
					<Input bind:value={$form.email} name="email" type="email" />
					{#if $errors.email}
						<p class="text-red-500 text-xs">{$errors.email}</p>
					{/if}
				</div>
				<div class="col-span-2 space-y-2">
					<Label for="email">Company Name</Label>
					<Input bind:value={$form.companyName} name="companyName" type="text" />
					{#if $errors.companyName}
						<p class="text-red-500 text-xs">{$errors.companyName}</p>
					{/if}
				</div>
				<div class="col-span-2 space-y-2">
					<Label for="password">Password</Label>
					<Input bind:value={$form.password} name="password" type="text" />
					{#if $errors.password}
						<p class="text-red-500 text-xs">{$errors.password}</p>
					{/if}
				</div>
			</div>
			<Dialog.Footer>
				<Button type="button" variant="destructive" on:click={() => (addDialogOpen = false)}
					>Cancel</Button
				>
				<Button type="submit" class="bg-green-500 hover:bg-green-600" disabled={$submitting}>
					{$submitting ? 'Creating...' : 'Submit'}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
