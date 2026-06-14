<script lang="ts">
	import type { PageData } from './$types';
	import {
		ArrowUpDown,
		Users,
		ChevronLeft,
		ChevronRight,
		Plus
	} from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { writable } from 'svelte/store';
	import * as Table from '$lib/components/ui/table';
	import * as Tabs from '$lib/components/ui/tabs';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';
	import { StatusBadge } from '$lib/components/ui/status-badge';
	import {
		getCoreRowModel,
		type ColumnDef,
		getSortedRowModel,
		getPaginationRowModel,
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
			status: string | null;
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

	type StatusKey = 'PENDING' | 'ACTIVE' | 'INACTIVE' | 'DENIED';
	const TABS: { value: StatusKey; label: string }[] = [
		{ value: 'ACTIVE', label: 'Active' },
		{ value: 'PENDING', label: 'Pending' },
		{ value: 'INACTIVE', label: 'Inactive' },
		{ value: 'DENIED', label: 'Denied' }
	];

	let searchTerm = data.searchTerm || '';
	let addDialogOpen = false;

	$: activeTab = (data.status as StatusKey) || 'ACTIVE';
	$: clients = (data.clients as ClientData[]) || [];
	$: statusCounts = data.statusCounts as Record<StatusKey, number>;

	function statusLabel(s: string | null | undefined) {
		switch (s) {
			case 'ACTIVE':
				return 'Approved';
			case 'DENIED':
				return 'Denied';
			case 'INACTIVE':
				return 'Inactive';
			default:
				return 'Pending';
		}
	}

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
			header: 'Status',
			id: 'status',
			accessorFn: (row) => row.profile.status ?? 'PENDING',
			enableSorting: true,
			cell: ({ getValue }) => {
				const status = getValue() as string;
				return flexRender(StatusBadge, { status, label: statusLabel(status) });
			}
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

	const options = writable<TableOptions<ClientData>>({
		data: clients,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		initialState: {
			pagination: { pageSize: 10 }
		}
	});
	const table = createSvelteTable(options);

	$: options.update((o) => ({ ...o, data: clients, columns }));

	function buildHref(nextStatus: StatusKey, nextSearch = searchTerm) {
		const params = new URLSearchParams();
		params.set('status', nextStatus);
		if (nextSearch && nextSearch.trim()) params.set('search', nextSearch.trim());
		return `/clients?${params.toString()}`;
	}

	function handleTabChange(value: string | undefined) {
		if (!value) return;
		const next = value as StatusKey;
		if (next === activeTab) return;
		goto(buildHref(next), { keepFocus: true, noScroll: true });
	}

	function handleSearch(value: string) {
		goto(buildHref(activeTab, value), { replaceState: true });
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
				class="bg-primary hover:bg-primary/90"
				on:click={() => handleSearch(searchTerm)}
				>Search
			</Button>
		</form>
		<Button class="bg-primary hover:bg-primary/90 gap-2" on:click={() => (addDialogOpen = true)}
			><Plus />Add Client</Button
		>
	</div>

	<!-- Tabs with single status-filtered table -->
	<Tabs.Root value={activeTab} onValueChange={handleTabChange}>
		<Tabs.List class="grid w-full grid-cols-4">
			{#each TABS as tab}
				<Tabs.Trigger value={tab.value} class="relative">
					{tab.label}
					{#if (statusCounts?.[tab.value] ?? 0) > 0}
						<Badge
							variant="secondary"
							class="ml-2 h-5 min-w-5 text-xs"
							value={statusCounts[tab.value]}
						></Badge>
					{/if}
				</Tabs.Trigger>
			{/each}
		</Tabs.List>

		{#each TABS as tab}
			<Tabs.Content value={tab.value}>
				{#if activeTab === tab.value}
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
																	header.column.toggleSorting(
																		header.column.getIsSorted() === 'asc'
																	)}
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
									Showing {$table.getState().pagination.pageIndex *
										$table.getState().pagination.pageSize +
										1} to {Math.min(
										($table.getState().pagination.pageIndex + 1) *
											$table.getState().pagination.pageSize,
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
								<div
									class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4"
								>
									<Users class="w-8 h-8 text-gray-400" />
								</div>
								<h3 class="text-lg font-medium text-gray-900 mb-2">
									No {tab.label.toLowerCase()} clients found
								</h3>
								<p class="text-sm text-gray-500">
									{#if searchTerm}
										Try adjusting your search terms
									{:else}
										No client profiles in this status
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
				<Button type="button" variant="destructiveOutline" on:click={() => (addDialogOpen = false)}
					>Cancel</Button
				>
				<Button type="submit" class="bg-primary hover:bg-primary/90" disabled={$submitting}>
					{$submitting ? 'Creating...' : 'Submit'}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
