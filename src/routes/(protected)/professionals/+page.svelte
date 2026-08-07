<script lang="ts">
	import {
		type ColumnDef,
		getSortedRowModel,
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
	import { ArrowUpDown, ArrowUp, ArrowDown, Users, Plus } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import type { PageData } from './$types';
	import { writable } from 'svelte/store';
	import ViewLink from '$lib/components/tables/ViewLink.svelte';
	import DisciplineCell from '$lib/components/tables/DisciplineCell.svelte';
	import FilterBar from '$lib/components/filters/FilterBar.svelte';
	import type { FilterDimension } from '$lib/components/filters/types';
	import * as Dialog from '$lib/components/ui/dialog';
	import Label from '$lib/components/ui/label/label.svelte';
	import { superForm } from 'sveltekit-superforms/client';
	import type { AdminNewUserSchema } from '$lib/config/zod-schemas';
	import {
		buildProfessionalFiltersHref,
		type DisciplineSummary,
		type ProfessionalFilterChanges
	} from '$lib/_helpers/professional-filters';
	import { debounce } from '$lib/_helpers/debounce';
	import { formatUSPhoneForDisplay } from '$lib/_helpers/phone';

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

	// Derived from the loader's return type so it can't drift from the query.
	type CandidateData = PageData['candidates'][number] & { disciplines: DisciplineSummary[] };

	type StatusKey = 'ACTIVE' | 'PENDING' | 'INACTIVE' | 'DENIED';
	const TABS: { value: StatusKey; label: string }[] = [
		{ value: 'ACTIVE', label: 'Active' },
		{ value: 'PENDING', label: 'Pending' },
		{ value: 'INACTIVE', label: 'Inactive' },
		{ value: 'DENIED', label: 'Denied' }
	];

	$: activeTab = (data.status as StatusKey) || 'ACTIVE';
	$: candidates = (data.candidates as CandidateData[]) || [];
	$: statusCounts = data.statusCounts as Record<StatusKey, number>;
	$: filters = data.filters;
	$: facets = data.facets;

	// Reactive off `data` (not a one-time initializer) so a pasted URL, a shared
	// link, or back/forward navigation forces the filter state onto the UI.
	$: appliedSearch = data.searchTerm ?? '';
	$: selectedDisciplineIds = filters.disciplineIds ?? [];

	// The input keeps its own copy: re-syncing it on every `data` change would
	// let a slow in-flight navigation overwrite characters typed since. Only
	// adopt the URL value when it changed to something we didn't just submit
	// (i.e. back/forward or a pasted link).
	let searchInput = data.searchTerm ?? '';
	let lastSubmittedSearch = data.searchTerm ?? '';
	$: if (appliedSearch !== lastSubmittedSearch) {
		searchInput = appliedSearch;
		lastSubmittedSearch = appliedSearch;
	}

	$: filterDimensions = [
		{
			key: 'discipline',
			label: 'Discipline',
			options: facets.disciplines,
			selected: selectedDisciplineIds
		},
		{ key: 'city', label: 'City', options: facets.cities, selected: filters.cities ?? [] },
		{ key: 'state', label: 'State', options: facets.states, selected: filters.states ?? [] },
		{ key: 'zip', label: 'Zip', options: facets.zipcodes, selected: filters.zipcodes ?? [] }
	] satisfies FilterDimension[];

	$: activeFilterCount = filterDimensions.reduce((total, d) => total + d.selected.length, 0);

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
			id: 'disciplines',
			accessorFn: (row) => row.disciplines?.map((entry) => entry.name).join(', ') ?? '',
			enableSorting: true,
			cell: ({ row }) =>
				flexRender(DisciplineCell, {
					disciplines: row.original.disciplines ?? [],
					highlightIds: selectedDisciplineIds
				})
		},
		{
			header: 'Email',
			id: 'email',
			accessorFn: (row) => row.user.email ?? '',
			enableSorting: true,
			cell: ({ getValue }) => (getValue() as string) || 'N/A'
		},
		{
			header: 'Cell Number',
			id: 'cellPhone',
			accessorFn: (row) => row.profile.cellPhone ?? '',
			enableSorting: true,
			cell: ({ getValue }) => formatUSPhoneForDisplay(getValue() as string) || 'N/A'
		},
		{
			header: 'Address',
			id: 'address',
			accessorFn: (row) => row.profile.completeAddress ?? '',
			enableSorting: true,
			cell: ({ getValue }) => {
				const location = (getValue() as string) ?? '';
				const truncatedString =
					location.length > 40 ? location.substring(0, 40) + '...' : location;
				return truncatedString || 'N/A';
			},
			sortingFn: (rowA, rowB) => {
				const locationA = rowA.original.profile.completeAddress?.toLowerCase() ?? '';
				const locationB = rowB.original.profile.completeAddress?.toLowerCase() ?? '';
				return locationA.localeCompare(locationB);
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

	// Pagination removed by request — every matching row renders. The query never
	// had a LIMIT, so this changes what is displayed, not what is fetched.
	const createTableOptions = (rows: CandidateData[]): TableOptions<CandidateData> => ({
		data: rows,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel()
	});

	const tableOptions = writable<TableOptions<CandidateData>>(createTableOptions(candidates));
	const currentTable = createSvelteTable(tableOptions);

	$: tableOptions.update((opts) => ({ ...opts, data: candidates, columns }));

	function applyFilters(changes: ProfessionalFilterChanges, replaceState = false) {
		goto(buildProfessionalFiltersHref($page.url.searchParams, changes), {
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

	function handleRowClick(candidateId: string) {
		goto(`/professionals/${candidateId}`);
	}

	// 1s: each search fires five queries (the list plus four facet counts)
	// across the full candidate table, so wait until typing settles — but not
	// so long that the page feels unresponsive.
	const SEARCH_DEBOUNCE_MS = 800;

	const pushSearch = debounce((value: string) => {
		lastSubmittedSearch = value.trim();
		applyFilters({ search: value }, true);
	}, SEARCH_DEBOUNCE_MS);

	function handleDimensionChange(key: string, values: string[]) {
		applyFilters({ [key]: values } as ProfessionalFilterChanges);
	}

	function handleClearAll() {
		applyFilters({ search: null, discipline: [], city: [], state: [], zip: [] });
	}
</script>

<section class="container mx-auto px-4 py-6 flex flex-col gap-6">
	<!-- Header -->
	<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Professionals</h1>
			<p class="text-muted-foreground">Manage professional member profiles</p>
		</div>
	</div>

	<div class="flex justify-between flex-wrap items-center gap-4">
		<!-- Search -->
		<form on:submit|preventDefault class="flex items-center gap-2">
			<Input
				bind:value={searchInput}
				on:input={() => pushSearch(searchInput)}
				placeholder="Search name, email, cell, address..."
				class="bg-white w-72 max-w-full"
			/>
		</form>
		<Button class="bg-primary hover:bg-primary/90 gap-2" on:click={() => (addDialogOpen = true)}
			><Plus />Add Professional</Button
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

	<!-- Tabs with Tables -->
	<Tabs.Root value={activeTab} onValueChange={handleTabChange} class="">
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

		<!-- Tab Contents -->
		{#each TABS as tab}
			<Tabs.Content value={tab.value} class="">
				{#if activeTab === tab.value}
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

							<div class="p-4 border-t text-sm text-muted-foreground">
								{$currentTable.getRowModel().rows.length}
								{$currentTable.getRowModel().rows.length === 1
									? 'professional'
									: 'professionals'}
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
									No {tab.label.toLowerCase()} professionals found
								</h3>
								<p class="text-sm text-gray-500">
									{#if appliedSearch || activeFilterCount}
										Try adjusting your search or filters
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
		<form
			use:enhance
			method="POST"
			action="/professionals?/adminCreateProfessional"
			class="space-y-4"
		>
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
