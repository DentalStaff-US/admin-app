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
	import * as Tabs from '$lib/components/ui/tabs';
	import * as Table from '$lib/components/ui/table';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import type { PageData } from './$types';
	import { writable } from 'svelte/store';
	import { onMount } from 'svelte';
	import {
		ArrowUpDown,
		ArrowUp,
		ArrowDown,
		Search,
		ChevronLeft,
		ChevronRight,
		Users,
		Eye,
		UserMinus,
		UserPlus,
		Shield,
		User
	} from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { cn } from '$lib/utils';
	import { STAFF_ROLE_ENUM } from '$lib/config/constants';
	import AddStaffToLocation from '$lib/components/dialogs/inviteNewStaffDialog.svelte';

	type StaffProfileData = {
		profile: {
			id: string;
			userId: string;
			createdAt: Date;
			updatedAt: Date;
			birthday: string | null;
			clientId: string;
			companyId: string;
			staffRole: 'CLIENT_ADMIN' | 'CLIENT_MANAGER' | 'CLIENT_EMPLOYEE' | null;
		};
		user: {
			id: string;
			firstName: string;
			lastName: string;
			email: string;
			avatarUrl: string;
		};
	};

	export let data: PageData;

	let searchTerm = data.searchTerm || '';
	let activeTab = 'all';
	let open: boolean = false;
	let detailsDialogOpen: boolean = false;
	let selectedProfile: StaffProfileData | null = null;

	$: user = data.user;
	$: staff = (data.staff as StaffProfileData[]) || [];
	$: locations = data.locations;
	$: company = data.company;
	$: inviteForm = data.inviteForm;

	// Filter staff by role
	const filterByRole = (staff: StaffProfileData[], role: string) => {
		switch (role) {
			case 'admin':
				return staff.filter((s) => s.profile.staffRole === 'CLIENT_ADMIN');
			case 'manager':
				return staff.filter((s) => s.profile.staffRole === 'CLIENT_MANAGER');
			case 'employee':
				return staff.filter((s) => s.profile.staffRole === 'CLIENT_EMPLOYEE');
			default:
				return staff;
		}
	};

	// Column definitions
	const columns: ColumnDef<StaffProfileData>[] = [
		// {
		// 	header: '',
		// 	id: 'actions',
		// 	enableSorting: false,
		// 	cell: ({ row }) => (
		// 		<Button
		// 			variant="ghost"
		// 			size="icon"
		// 			class="h-8 w-8"
		// 			on:click={() => handleViewStaff(row.original)}
		// 		>
		// 			<Eye class="h-4 w-4" />
		// 		</Button>
		// 	)
		// },
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
			header: 'Email',
			id: 'email',
			accessorKey: 'user.email',
			enableSorting: true
		},
		{
			header: 'Role',
			id: 'role',
			accessorFn: (row) => {
				const role = row.profile.staffRole as keyof typeof STAFF_ROLE_ENUM;
				return STAFF_ROLE_ENUM[role] || 'N/A';
			},
			enableSorting: true,
			cell: ({ getValue, row }) => {
				const roleText = getValue() as string;
				const staffRole = row.original.profile.staffRole;

				return flexRender(Badge, {
					value: roleText,
					class: cn(
						'text-xs',
						staffRole === 'CLIENT_ADMIN' && 'bg-purple-100 text-purple-800',
						staffRole === 'CLIENT_MANAGER' && 'bg-blue-100 text-blue-800',
						staffRole === 'CLIENT_EMPLOYEE' && 'bg-gray-100 text-gray-800'
					)
				});
			}
		},
		{
			header: 'Joined',
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
		// {
		// 	id: 'remove',
		// 	header: '',
		// 	enableSorting: false,
		// 	cell: ({ row }) => (
		// 		<Button
		// 			variant="ghost"
		// 			size="icon"
		// 			class="h-8 w-8 text-red-500 hover:text-red-700"
		// 			on:click={() => handleRemoveStaff(row.original)}
		// 		>
		// 			<UserMinus class="h-4 w-4" />
		// 		</Button>
		// 	)
		// }
	];

	// Create separate table instances for each tab
	const createTableOptions = (data: StaffProfileData[]): TableOptions<StaffProfileData> => ({
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

	// Table options for each tab
	const allOptions = writable<TableOptions<StaffProfileData>>(createTableOptions([]));
	const adminOptions = writable<TableOptions<StaffProfileData>>(createTableOptions([]));
	const managerOptions = writable<TableOptions<StaffProfileData>>(createTableOptions([]));
	const employeeOptions = writable<TableOptions<StaffProfileData>>(createTableOptions([]));

	// Create table instances
	const allTable = createSvelteTable(allOptions);
	const adminTable = createSvelteTable(adminOptions);
	const managerTable = createSvelteTable(managerOptions);
	const employeeTable = createSvelteTable(employeeOptions);

	// Get current active table
	$: currentTable =
		activeTab === 'all'
			? allTable
			: activeTab === 'admin'
				? adminTable
				: activeTab === 'manager'
					? managerTable
					: employeeTable;

	// Update table data when staff changes
	$: {
		const allData = staff;
		const adminData = filterByRole(staff, 'admin');
		const managerData = filterByRole(staff, 'manager');
		const employeeData = filterByRole(staff, 'employee');

		allOptions.update((opts) => ({ ...opts, data: allData, columns }));
		adminOptions.update((opts) => ({ ...opts, data: adminData, columns }));
		managerOptions.update((opts) => ({ ...opts, data: managerData, columns }));
		employeeOptions.update((opts) => ({ ...opts, data: employeeData, columns }));
	}

	onMount(() => {
		const allData = staff;
		const adminData = filterByRole(staff, 'admin');
		const managerData = filterByRole(staff, 'manager');
		const employeeData = filterByRole(staff, 'employee');

		allOptions.update((opts) => ({ ...opts, data: allData, columns }));
		adminOptions.update((opts) => ({ ...opts, data: adminData, columns }));
		managerOptions.update((opts) => ({ ...opts, data: managerData, columns }));
		employeeOptions.update((opts) => ({ ...opts, data: employeeData, columns }));
	});

	// Get tab counts
	$: tabCounts = {
		all: staff.length,
		admin: filterByRole(staff, 'admin').length,
		manager: filterByRole(staff, 'manager').length,
		employee: filterByRole(staff, 'employee').length
	};

	function getSortingIcon(header: any) {
		if (!header.column.getCanSort()) return null;

		const sorted = header.column.getIsSorted();
		if (sorted === 'asc') return ArrowUp;
		if (sorted === 'desc') return ArrowDown;
		return ArrowUpDown;
	}

	function handleSearch(searchTerm: string) {
		if (!searchTerm || searchTerm.trim() === '') {
			goto('/staff');
		} else {
			goto(`/staff?search=${encodeURIComponent(searchTerm.trim())}`);
		}
	}

	function handleSearchKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			handleSearch(searchTerm);
		}
	}

	const handleViewStaff = (profile: StaffProfileData) => {
		selectedProfile = profile;
		detailsDialogOpen = true;
		open = false;
	};

	const handleCloseDetailsDialog = () => {
		detailsDialogOpen = false;
		selectedProfile = null;
	};
</script>

<svelte:head>
	<title>Staff | DTSS</title>
</svelte:head>

<section class="grow h-screen overflow-y-auto p-6 flex flex-col gap-6">
	<!-- Header -->
	<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Staff</h1>
			<p class="text-muted-foreground">Manage your team members and their roles</p>
		</div>

		<AddStaffToLocation {open} {inviteForm} {locations} {company} />
	</div>

	<!-- Search -->
	<form on:submit|preventDefault={() => handleSearch(searchTerm)} class="flex items-center gap-2">
		<Input
			bind:value={searchTerm}
			placeholder="Search staff..."
			class="bg-white max-w-xs"
			on:keydown={handleSearchKeydown}
		/>
		<Button
			size="sm"
			class="bg-primary hover:bg-primary/90"
			on:click={() => handleSearch(searchTerm)}
		>
			Search
		</Button>
	</form>

	{#if staff.length === 0}
		<!-- Empty State -->
		<Card.Root class="w-full flex flex-col items-center p-12 border-dashed">
			<div class="flex flex-col items-center gap-4 text-center">
				<div class="rounded-full bg-muted p-4">
					<Users class="h-8 w-8 text-muted-foreground" />
				</div>
				<Card.Title class="text-2xl">No staff members yet</Card.Title>
				<Card.Description class="max-w-[420px] text-center text-muted-foreground">
					{#if searchTerm}
						No staff members found matching your search terms. Try adjusting your search.
					{:else}
						You haven't invited any staff members yet. Start by inviting your first team member.
					{/if}
				</Card.Description>
				{#if !searchTerm}
					<Button on:click={() => (open = true)} class="bg-primary hover:bg-primary/90 mt-4">
						<UserPlus class="h-4 w-4 mr-2" />
						Invite First Staff Member
					</Button>
				{/if}
			</div>
		</Card.Root>
	{:else}
		<!-- Tabs with Tables -->
		<Tabs.Root bind:value={activeTab} class="">
			<Tabs.List class="grid w-full grid-cols-4">
				<Tabs.Trigger value="all" class="relative">
					All Staff
					{#if tabCounts.all > 0}
						<Badge variant="secondary" class="ml-2 h-5 min-w-5 text-xs" value={tabCounts.all}
						></Badge>
					{/if}
				</Tabs.Trigger>
				<Tabs.Trigger value="admin" class="relative">
					<Shield class="h-4 w-4 mr-1" />
					Admins
					{#if tabCounts.admin > 0}
						<Badge
							variant="secondary"
							class="ml-2 h-5 min-w-5 text-xs bg-purple-100 text-purple-800"
							value={tabCounts.admin}
						></Badge>
					{/if}
				</Tabs.Trigger>
				<Tabs.Trigger value="manager" class="relative">
					<Users class="h-4 w-4 mr-1" />
					Managers
					{#if tabCounts.manager > 0}
						<Badge
							variant="secondary"
							class="ml-2 h-5 min-w-5 text-xs bg-blue-100 text-blue-800"
							value={tabCounts.manager}
						></Badge>
					{/if}
				</Tabs.Trigger>
				<Tabs.Trigger value="employee" class="relative">
					<User class="h-4 w-4 mr-1" />
					Employees
					{#if tabCounts.employee > 0}
						<Badge
							variant="secondary"
							class="ml-2 h-5 min-w-5 text-xs bg-gray-100 text-gray-800"
							value={tabCounts.employee}
						></Badge>
					{/if}
				</Tabs.Trigger>
			</Tabs.List>

			<!-- Tab Contents -->
			{#each ['all', 'admin', 'manager', 'employee'] as tabValue}
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
																		{#if getSortingIcon(header)}
																			<svelte:component
																				this={getSortingIcon(header)}
																				class="ml-2 h-4 w-4"
																			/>
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
													on:click={() => handleViewStaff(row.original)}
													class="hover:bg-muted/50"
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
										)} of {$currentTable.getRowModel().rows.length} staff members
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
								<!-- Empty state for specific tab -->
								<div class="flex flex-col items-center justify-center py-12 text-center">
									<div
										class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4"
									>
										{#if activeTab === 'admin'}
											<Shield class="w-8 h-8 text-purple-500" />
										{:else if activeTab === 'manager'}
											<Users class="w-8 h-8 text-blue-500" />
										{:else if activeTab === 'employee'}
											<User class="w-8 h-8 text-gray-500" />
										{:else}
											<Users class="w-8 h-8 text-gray-400" />
										{/if}
									</div>
									<h3 class="text-lg font-medium text-gray-900 mb-2">
										No {activeTab === 'all'
											? 'staff members'
											: activeTab === 'admin'
												? 'admins'
												: activeTab === 'manager'
													? 'managers'
													: 'employees'} found
									</h3>
									<p class="text-sm text-gray-500">
										{#if searchTerm}
											Try adjusting your search terms
										{:else}
											No {activeTab === 'all' ? 'staff members' : `${activeTab}s`} in this category yet.
										{/if}
									</p>
								</div>
							{/if}
						</div>
					{/if}
				</Tabs.Content>
			{/each}
		</Tabs.Root>
	{/if}
</section>

<!-- Staff Details Dialog -->
<Dialog.Root bind:open={detailsDialogOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Staff Details</Dialog.Title>
		</Dialog.Header>
		<div>
			{#if selectedProfile}
				<div class="space-y-4">
					<div class="flex items-center gap-3">
						<div class="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
							<User class="h-6 w-6 text-blue-600" />
						</div>
						<div>
							<p class="font-semibold">
								{selectedProfile.user.firstName}
								{selectedProfile.user.lastName}
							</p>
							<p class="text-sm text-muted-foreground">{selectedProfile.user.email}</p>
						</div>
					</div>

					{#if selectedProfile.profile.staffRole}
						<div class="flex items-center gap-2">
							<strong>Role:</strong>
							<!-- <Badge
								variant="secondary"
								class={cn(
									'text-xs',
									selectedProfile.profile.staffRole === 'CLIENT_ADMIN' && 'bg-purple-100 text-purple-800',
									selectedProfile.profile.staffRole === 'CLIENT_MANAGER' && 'bg-blue-100 text-blue-800',
									selectedProfile.profile.staffRole === 'CLIENT_EMPLOYEE' && 'bg-gray-100 text-gray-800'
								)}
							>
								{selectedProfile.profile.staffRole === 'CLIENT_ADMIN' && <Shield class="h-3 w-3 mr-1" />}
								{selectedProfile.profile.staffRole === 'CLIENT_MANAGER' && <Users class="h-3 w-3 mr-1" />}
								{selectedProfile.profile.staffRole === 'CLIENT_EMPLOYEE' && <User class="h-3 w-3 mr-1" />}
								{STAFF_ROLE_ENUM[selectedProfile.profile.staffRole]}
							</Badge> -->
						</div>
					{/if}

					<p><strong>Birthday:</strong> {selectedProfile.profile.birthday || 'N/A'}</p>
					<p>
						<strong>Joined:</strong>
						{new Date(selectedProfile.profile.createdAt).toLocaleDateString()}
					</p>
				</div>
			{:else}
				<p>No staff profile selected.</p>
			{/if}
		</div>
		<Dialog.Footer>
			<Dialog.Close asChild>
				<Button on:click={handleCloseDetailsDialog} variant="outline" type="button" class="w-full">
					Close
				</Button>
			</Dialog.Close>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
