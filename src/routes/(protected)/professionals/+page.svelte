<script lang="ts">
	import {
		type ColumnDef,
		getSortedRowModel,
		getPaginationRowModel,
		type TableOptions,
		createSvelteTable,
		flexRender,
		getCoreRowModel
	} from '@tanstack/svelte-table';
	import * as Tabs from '$lib/components/ui/tabs';
	import * as Table from '$lib/components/ui/table';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';
	import {
		ArrowUpDown,
		ArrowUp,
		ArrowDown,
		Search,
		Users,
		ChevronLeft,
		ChevronRight,
		Filter,
		Plus
	} from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { cn } from '$lib/utils';
	import type { PageData } from './$types';
	import { writable } from 'svelte/store';
	import { onMount } from 'svelte';
	import ViewLink from '$lib/components/tables/ViewLink.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import Label from '$lib/components/ui/label/label.svelte';
	import { superForm } from 'sveltekit-superforms/client';
	import type { AdminNewUserSchema } from '$lib/config/zod-schemas';

	export let data: PageData;
	$: newProfileForm = data.newProfileForm;
	let addDialogOpen = false;

	const { form, errors, submitting, enhance } = superForm<AdminNewUserSchema>(newProfileForm, {
		onResult: ({ result }) => {
			console.log('Form result:', result);
			if (result.type === 'success') {
				addDialogOpen = false;
				// // Optionally reload the page or refresh data
				// window.location.reload();
			}
		}
	});

	type CandidateData = {
		profile: {
			id: string;
			userId: string;
			status: string;
			city: string;
			state: string;
			zipcode: string;
			completeAddress: string;
			createdAt: Date;
		};
		user: {
			id: string;
			firstName: string;
			lastName: string;
			avatarUrl: string;
		};
		discipline: {
			id: string;
			name: string;
		};
	};

	let searchTerm = data.searchTerm || '';
	let activeTab = 'approved';

	$: candidates = (data.candidates as CandidateData[]) || [];

	// Filter candidates by status
	const filterByStatus = (candidates: CandidateData[], status: string) => {
		return candidates.filter((candidate) =>
			status === 'approved'
				? candidate.profile.status === 'ACTIVE'
				: candidate.profile.status === 'PENDING'
		);
	};

	// Slimmed down column definitions
	const columns: ColumnDef<CandidateData>[] = [
		{
			header: '',
			id: 'id',
			accessorKey: 'profile.id',
			enableSorting: false,
			cell: ({ getValue }) =>
				flexRender(ViewLink, {
					href: `/professionals/${getValue()}`
				})
		},
		{
			header: 'Name',
			id: 'name',
			accessorFn: (row) => `${row.user.lastName}, ${row.user.firstName}`,
			enableSorting: true,
			sortingFn: (rowA, rowB) => {
				const nameA =
					`${rowA.original.user.lastName}, ${rowA.original.user.firstName}`.toLowerCase();
				const nameB =
					`${rowB.original.user.lastName}, ${rowB.original.user.firstName}`.toLowerCase();
				return nameA.localeCompare(nameB);
			}
		},
		{
			header: 'Discipline',
			id: 'discipline',
			accessorKey: 'discipline.name',
			enableSorting: true,
			sortingFn: (rowA, rowB) => {
				const disciplineA = rowA.original.discipline?.name?.toLowerCase() || '';
				const disciplineB = rowB.original.discipline?.name?.toLowerCase() || '';
				return disciplineA.localeCompare(disciplineB);
			}
		},
		{
			header: 'Address',
			id: 'address',
			accessorFn: (row) => row.profile.completeAddress,
			enableSorting: true,
			cell: ({ getValue }) => {
				const location = getValue() as string;
				const truncatedString =
					location?.length > 40 ? location.substring(0, 40) + '...' : location;
				return truncatedString || 'N/A';
			},
			sortingFn: (rowA, rowB) => {
				const locationA = rowA.original.profile.completeAddress?.toLowerCase();
				const locationB = rowB.original.profile.completeAddress?.toLowerCase();
				return locationA?.localeCompare(locationB);
			}
		},
		{
			header: 'Status',
			id: 'status',
			accessorKey: 'profile.status',
			enableSorting: true,
			cell: ({ getValue }) => {
				const status = getValue() as string;
				return flexRender(Badge, {
					value: status,
					class: cn(
						'text-xs',
						status === 'APPROVED'
							? 'bg-green-100 text-green-800'
							: status === 'PENDING'
								? 'bg-yellow-100 text-yellow-800'
								: 'bg-gray-100 text-gray-800'
					)
				});
			}
		},
		{
			header: 'Created',
			id: 'createdAt',
			accessorKey: 'profile.createdAt',
			enableSorting: true,
			sortingFn: (rowA, rowB) => {
				const dateA = new Date(rowA.original.profile.createdAt).getTime();
				const dateB = new Date(rowB.original.profile.createdAt).getTime();
				return dateA - dateB;
			},
			cell: ({ getValue }) => {
				const date = getValue() as Date;
				return new Date(date).toLocaleDateString();
			}
		}
	];

	// Create separate table instances for each tab
	const createTableOptions = (data: CandidateData[]): TableOptions<CandidateData> => ({
		data,
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

	// Table options for each status
	const approvedOptions = writable<TableOptions<CandidateData>>(createTableOptions([]));
	const pendingOptions = writable<TableOptions<CandidateData>>(createTableOptions([]));

	// Create table instances
	const approvedTable = createSvelteTable(approvedOptions);
	const pendingTable = createSvelteTable(pendingOptions);

	// Get current active table
	$: currentTable = activeTab === 'approved' ? approvedTable : pendingTable;

	// Update table data when candidates change
	$: {
		const approvedData = filterByStatus(candidates, 'approved');
		const pendingData = filterByStatus(candidates, 'pending');

		approvedOptions.update((opts) => ({ ...opts, data: approvedData, columns }));
		pendingOptions.update((opts) => ({ ...opts, data: pendingData, columns }));
	}

	onMount(() => {
		const approvedData = filterByStatus(candidates, 'approved');
		const pendingData = filterByStatus(candidates, 'pending');

		approvedOptions.update((opts) => ({ ...opts, data: approvedData, columns }));
		pendingOptions.update((opts) => ({ ...opts, data: pendingData, columns }));
	});

	// Get tab counts
	$: tabCounts = {
		approved: filterByStatus(candidates, 'approved').length,
		pending: filterByStatus(candidates, 'pending').length
	};

	function handleRowClick(candidateId: string) {
		goto(`/professionals/${candidateId}`);
	}

	function handleSearch(searchTerm: string) {
		if (!searchTerm || searchTerm.trim() === '') {
			goto('/professionals', { replaceState: true });
			return;
		}
		goto(`/professionals?search=${encodeURIComponent(searchTerm)}`, { replaceState: true });
	}
</script>

<section class="container mx-auto px-4 py-6 flex flex-col gap-6">
	<!-- Header -->
	<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Professional Members</h1>
			<p class="text-muted-foreground">Manage professional member profiles</p>
		</div>
	</div>

	<div class="flex justify-between flex-wrap items-center">
		<!-- Search -->
		<form on:submit|preventDefault={() => handleSearch(searchTerm)} class="flex items-center gap-2">
			<Input
				bind:value={searchTerm}
				placeholder="Search professionals..."
				class="bg-white max-w-xs"
			/>
			<Button
				size="sm"
				class="bg-blue-800 hover:bg-blue-900"
				on:click={() => handleSearch(searchTerm)}>Search</Button
			>
		</form>
		<Button class="bg-blue-800 hover:bg-blue-900 gap-2" on:click={() => (addDialogOpen = true)}
			><Plus />Add Professional</Button
		>
	</div>

	<!-- Tabs with Tables -->
	<Tabs.Root bind:value={activeTab} class="">
		<Tabs.List class="grid w-full grid-cols-2">
			<Tabs.Trigger value="approved" class="relative">
				Approved
				{#if tabCounts.approved > 0}
					<Badge variant="secondary" class="ml-2 h-5 min-w-5 text-xs" value={tabCounts.approved}
					></Badge>
				{/if}
			</Tabs.Trigger>
			<Tabs.Trigger value="pending" class="relative">
				Pending
				{#if tabCounts.pending > 0}
					<Badge variant="secondary" class="ml-2 h-5 min-w-5 text-xs" value={tabCounts.pending}
					></Badge>
				{/if}
			</Tabs.Trigger>
		</Tabs.List>

		<!-- Tab Contents -->
		{#each ['approved', 'pending'] as tabValue}
			<Tabs.Content value={tabValue} class="">
				{#if activeTab === tabValue}
					<div class="bg-white rounded-lg shadow-sm">
						{#if $currentTable.getRowModel().rows.length > 0}
							<div class="rounded-md border">
								<Table.Root>
									<Table.Header>
										{#each $currentTable.getHeaderGroups() as headerGroup}
											<Table.Row>
												{#each headerGroup.headers as header}
													<Table.Head>
														{#if header.column.columnDef.header}
															<Button
																variant="ghost"
																on:click={() =>
																	header.column.toggleSorting(
																		header.column.getIsSorted() === 'asc'
																	)}
																class="hover:bg-gray-50"
															>
																{header.column.columnDef.header}
																{#if header.column.getCanSort()}
																	{#if header.column.getIsSorted() === 'asc'}
																		<ArrowUp class="ml-2 h-4 w-4" />
																	{:else if header.column.getIsSorted() === 'desc'}
																		<ArrowDown class="ml-2 h-4 w-4" />
																	{:else}
																		<ArrowUpDown class="ml-2 h-4 w-4" />
																	{/if}
																{/if}
															</Button>
														{/if}
													</Table.Head>
												{/each}
											</Table.Row>
										{/each}
									</Table.Header>
									<Table.Body>
										{#each $currentTable.getRowModel().rows as row}
											<Table.Row
												class="hover:bg-muted/50 cursor-pointer"
												on:click={() => handleRowClick(row.original.profile.id)}
											>
												{#each row.getVisibleCells() as cell}
													<Table.Cell>
														<svelte:component
															this={flexRender(cell.column.columnDef.cell, cell.getContext())}
														/>
													</Table.Cell>
												{/each}
											</Table.Row>
										{/each}
									</Table.Body>
								</Table.Root>
							</div>

							<!-- Pagination -->
							<div class="flex items-center justify-between space-x-2 p-4 border-t">
								<div class="flex-1 text-sm text-muted-foreground">
									Showing {$currentTable.getState().pagination.pageIndex *
										$currentTable.getState().pagination.pageSize +
										1} to {Math.min(
										($currentTable.getState().pagination.pageIndex + 1) *
											$currentTable.getState().pagination.pageSize,
										$currentTable.getRowModel().rows.length
									)} of {$currentTable.getRowModel().rows.length} candidates
								</div>
								<div class="flex items-center space-x-2">
									<Button
										variant="outline"
										size="sm"
										on:click={() => $currentTable.previousPage()}
										disabled={!$currentTable.getCanPreviousPage()}
									>
										<ChevronLeft class="h-4 w-4" />
										Previous
									</Button>
									<div class="flex items-center space-x-1">
										<span class="text-sm text-muted-foreground">
											Page {$currentTable.getState().pagination.pageIndex + 1} of {$currentTable.getPageCount()}
										</span>
									</div>
									<Button
										variant="outline"
										size="sm"
										on:click={() => $currentTable.nextPage()}
										disabled={!$currentTable.getCanNextPage()}
									>
										Next
										<ChevronRight class="h-4 w-4" />
									</Button>
								</div>
							</div>
						{:else}
							<!-- Empty state -->
							<div class="flex flex-col items-center justify-center py-12 text-center">
								<div
									class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4"
								>
									<Users class="w-8 h-8 text-gray-400" />
								</div>
								<h3 class="text-lg font-medium text-gray-900 mb-2">
									No {activeTab} professionals found
								</h3>
								<p class="text-sm text-gray-500">
									{#if searchTerm}
										Try adjusting your search terms
									{:else}
										Add some new professionals to assign shifts
									{/if}
								</p>
							</div>
						{/if}
					</div>
				{/if}
			</Tabs.Content>
		{/each}
	</Tabs.Root>
</section>

<Dialog.Root bind:open={addDialogOpen}>
	<Dialog.Content class="space-y-4">
		<form use:enhance method="POST" action="?/adminCreateProfessional" class="space-y-4">
			<Dialog.Header>
				<Dialog.Title>Add New Professional</Dialog.Title>
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
