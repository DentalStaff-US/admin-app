<script lang="ts">
	import type { PageData } from './$types';
	import { ArrowUpDown, Users, Plus } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
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
		type TableOptions,
		createSvelteTable,
		flexRender
	} from '@tanstack/svelte-table';
	import * as Dialog from '$lib/components/ui/dialog';
	import { superForm } from 'sveltekit-superforms/client';
	import { Label } from '$lib/components/ui/label';
	import type { AdminNewUserSchema } from '$lib/config/zod-schemas';
	import FilterBar from '$lib/components/filters/FilterBar.svelte';
	import type { FilterDimension } from '$lib/components/filters/types';
	import LocationCell from '$lib/components/tables/LocationCell.svelte';
	import {
		buildClientFiltersHref,
		type ClientFilterChanges,
		type LocationSummary
	} from '$lib/_helpers/client-filters';
	import { debounce } from '$lib/_helpers/debounce';

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
			status: string | null;
			cellPhone: string | null;
		};
		company: {
			id: string;
			companyName: string;
		};
		locations: LocationSummary[];
	};

	type StatusKey = 'PENDING' | 'ACTIVE' | 'INACTIVE' | 'DENIED';
	const TABS: { value: StatusKey; label: string }[] = [
		{ value: 'ACTIVE', label: 'Active' },
		{ value: 'PENDING', label: 'Pending' },
		{ value: 'INACTIVE', label: 'Inactive' },
		{ value: 'DENIED', label: 'Denied' }
	];

	let addDialogOpen = false;

	$: activeTab = (data.status as StatusKey) || 'ACTIVE';
	$: clients = (data.clients as ClientData[]) || [];
	$: statusCounts = data.statusCounts as Record<StatusKey, number>;
	$: filters = data.filters;
	$: facets = data.facets;

	// Reactive off `data` (not a one-time initializer) so a pasted URL, a shared
	// link, or back/forward navigation forces the filter state onto the UI.
	$: appliedSearch = data.searchTerm ?? '';
	$: selectedCities = filters.cities ?? [];
	$: selectedStates = filters.states ?? [];

	// The input keeps its own copy: re-syncing it on every `data` change would
	// let a slow in-flight navigation overwrite characters typed since. Only
	// adopt the URL value when it changed to something we didn't just submit.
	let searchInput = data.searchTerm ?? '';
	let lastSubmittedSearch = data.searchTerm ?? '';
	$: if (appliedSearch !== lastSubmittedSearch) {
		searchInput = appliedSearch;
		lastSubmittedSearch = appliedSearch;
	}

	$: filterDimensions = [
		{ key: 'city', label: 'City', options: facets.cities, selected: selectedCities },
		{ key: 'state', label: 'State', options: facets.states, selected: selectedStates },
		{ key: 'zip', label: 'Zip', options: facets.zipcodes, selected: filters.zipcodes ?? [] }
	] satisfies FilterDimension[];

	$: activeFilterCount = filterDimensions.reduce((total, d) => total + d.selected.length, 0);

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
			header: 'Location',
			id: 'locations',
			accessorFn: (row) =>
				row.locations?.map((entry) => [entry.city, entry.state].filter(Boolean).join(', ')).join('; ') ??
				'',
			enableSorting: true,
			cell: ({ row }) =>
				flexRender(LocationCell, {
					locations: row.original.locations ?? [],
					highlightCities: selectedCities,
					highlightStates: selectedStates
				})
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
		getSortedRowModel: getSortedRowModel()
	});
	const table = createSvelteTable(options);

	$: options.update((o) => ({ ...o, data: clients, columns }));

	// Merges onto the CURRENT params, so switching tabs or typing a search no
	// longer drops the active city/state/zip filters.
	function applyFilters(changes: ClientFilterChanges, replaceState = false) {
		goto(buildClientFiltersHref($page.url.searchParams, changes), {
			keepFocus: true,
			noScroll: true,
			replaceState
		});
	}

	function handleTabChange(value: string | undefined) {
		if (!value) return;
		const next = value as StatusKey;
		if (next === activeTab) return;
		applyFilters({ status: next });
	}

	// Each search fires four queries (the list plus three facet counts), so wait
	// until typing settles — but not so long that the page feels unresponsive.
	const SEARCH_DEBOUNCE_MS = 800;

	const pushSearch = debounce((value: string) => {
		lastSubmittedSearch = value.trim();
		applyFilters({ search: value }, true);
	}, SEARCH_DEBOUNCE_MS);

	function handleDimensionChange(key: string, values: string[]) {
		applyFilters({ [key]: values } as ClientFilterChanges);
	}

	function handleClearAll() {
		applyFilters({ search: null, city: [], state: [], zip: [] });
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

	<div class="flex justify-between flex-wrap items-center gap-4">
		<!-- Search -->
		<form on:submit|preventDefault class="flex items-center gap-2">
			<Input
				bind:value={searchInput}
				on:input={() => pushSearch(searchInput)}
				placeholder="Search name, email, company, address..."
				class="bg-white w-72 max-w-full"
			/>
		</form>
		<Button class="bg-primary hover:bg-primary/90 gap-2" on:click={() => (addDialogOpen = true)}
			><Plus />Add Client</Button
		>
	</div>

	<!-- Filters -->
	<FilterBar
		dimensions={filterDimensions}
		searchTerm={appliedSearch || null}
		on:change={(event) => handleDimensionChange(event.detail.key, event.detail.values)}
		on:clearSearch={() => applyFilters({ search: null })}
		on:clearAll={handleClearAll}
	/>

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

							<div class="p-4 border-t text-sm text-muted-foreground">
								{$table.getRowModel().rows.length} client{$table.getRowModel().rows.length === 1
									? ''
									: 's'}
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
									{#if appliedSearch || activeFilterCount}
										Try adjusting your search or filters
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
