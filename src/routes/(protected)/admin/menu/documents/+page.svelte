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
	import * as Table from '$lib/components/ui/table';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';
	import type { PageData } from './$types';
	import { writable } from 'svelte/store';
	import { onMount } from 'svelte';
	import {
		Loader2,
		ArrowUpDown,
		ArrowUp,
		ArrowDown,
		Search,
		ChevronLeft,
		ChevronRight,
		FileText,
		Download,
		Trash,
		ExternalLink,
		AlertCircle
	} from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { cn } from '$lib/utils';
	import { enhance as enhanceAction } from '$app/forms';

	export let data: PageData;

	type DocumentData = {
		id: string;
		createdAt: Date;
		updatedAt: Date;
		uploadUrl: string;
		expiryDate: Date | null;
		type: 'RESUME' | 'LICENSE' | 'CERTIFICATE' | 'OTHER';
		filename: string | null;
		candidateId: string;
		candidateFirstName: string | null;
		candidateLastName: string | null;
	};

	let tableData: DocumentData[] = [];
	let searchTerm = '';
	let selectedDocumentType: 'ALL' | 'RESUME' | 'LICENSE' | 'CERTIFICATE' | 'OTHER' = 'ALL';

	$: documents = (data.documents as DocumentData[]) || [];

	// Filter documents by type
	$: filteredDocuments =
		selectedDocumentType === 'ALL'
			? documents
			: documents.filter((doc) => doc.type === selectedDocumentType);

	// Helper function to get document type badge color
	function getDocumentTypeBadgeClass(type: string) {
		switch (type) {
			case 'RESUME':
				return 'bg-blue-100 text-blue-800 hover:bg-blue-100';
			case 'LICENSE':
				return 'bg-green-100 text-green-800 hover:bg-green-100';
			case 'CERTIFICATE':
				return 'bg-purple-100 text-purple-800 hover:bg-purple-100';
			case 'OTHER':
				return 'bg-gray-100 text-gray-800 hover:bg-gray-100';
			default:
				return 'bg-gray-100 text-gray-800 hover:bg-gray-100';
		}
	}

	// Helper function to check if document is expired
	function isExpired(expiryDate: Date | null): boolean {
		if (!expiryDate) return false;
		return new Date(expiryDate) < new Date();
	}

	// Column definitions
	const columns: ColumnDef<DocumentData>[] = [
		{
			header: 'Filename',
			id: 'filename',
			accessorKey: 'filename',
			enableSorting: true,
			sortingFn: (rowA, rowB) => {
				const valueA = rowA.original.filename?.toLowerCase() || '';
				const valueB = rowB.original.filename?.toLowerCase() || '';
				return valueA.localeCompare(valueB);
			},
			cell: ({ row }) => {
				const filename = row.original.filename;
				return filename || 'Untitled Document';
			}
		},
		{
			header: 'Candidate',
			id: 'candidate',
			accessorFn: (row) =>
				row.candidateFirstName && row.candidateLastName
					? `${row.candidateLastName}, ${row.candidateFirstName}`
					: 'Unknown',
			enableSorting: true,
			sortingFn: (rowA, rowB) => {
				const nameA =
					rowA.original.candidateLastName?.toLowerCase() ||
					rowA.original.candidateFirstName?.toLowerCase() ||
					'';
				const nameB =
					rowB.original.candidateLastName?.toLowerCase() ||
					rowB.original.candidateFirstName?.toLowerCase() ||
					'';
				return nameA.localeCompare(nameB);
			}
		},
		{
			header: 'Type',
			id: 'type',
			accessorKey: 'type',
			enableSorting: true,
			cell: ({ getValue }) => {
				const type = getValue() as string;
				return flexRender(Badge, {
					value: type,
					class: getDocumentTypeBadgeClass(type)
				});
			}
		},
		{
			header: 'Upload Date',
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
		},
	];

	// Table options
	const options = writable<TableOptions<DocumentData>>({
		data: filteredDocuments,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		initialState: {
			pagination: {
				pageSize: 10
			}
		}
	});

	// Update table data when documents or filter changes
	$: {
		tableData = filteredDocuments;
		options.update((o) => ({ ...o, data: tableData }));
	}

	onMount(() => {
		tableData = filteredDocuments;
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
			goto('/admin/menu/documents');
		} else {
			goto(`/admin/menu/documents?search=${encodeURIComponent(searchTerm.trim())}`);
		}
	}

	function handleDownload(url: string, filename: string | null) {
		// Open the document URL in a new tab
		window.open(url, '_blank');
	}
</script>

<section class="flex flex-col h-full p-6 space-y-6">
	<!-- Header -->
	<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Document Records</h1>
			<p class="text-muted-foreground">View and manage all uploaded documents</p>
		</div>
	</div>

	<!-- Search and Filters -->
	<div class="flex flex-col sm:flex-row gap-4">
		<form on:submit|preventDefault={() => handleSearch(searchTerm)} class="flex items-center gap-2">
			<Input
				bind:value={searchTerm}
				placeholder="Search by filename or candidate..."
				class="bg-white max-w-xs"
			/>
			<Button
				size="sm"
				class="bg-primary hover:bg-primary/90"
				on:click={() => handleSearch(searchTerm)}
			>
				<Search class="h-4 w-4" />
			</Button>
		</form>

		<!-- Document Type Filter -->
		<div class="flex gap-2 flex-wrap">
			<Button
				variant={selectedDocumentType === 'ALL' ? 'default' : 'outline'}
				size="sm"
				on:click={() => (selectedDocumentType = 'ALL')}
				class={cn(selectedDocumentType === 'ALL' && 'bg-primary hover:bg-primary/90')}
			>
				All
			</Button>
			<Button
				variant={selectedDocumentType === 'RESUME' ? 'default' : 'outline'}
				size="sm"
				on:click={() => (selectedDocumentType = 'RESUME')}
				class={cn(selectedDocumentType === 'RESUME' && 'bg-primary hover:bg-primary/90')}
			>
				Resume
			</Button>
			<Button
				variant={selectedDocumentType === 'LICENSE' ? 'default' : 'outline'}
				size="sm"
				on:click={() => (selectedDocumentType = 'LICENSE')}
				class={cn(selectedDocumentType === 'LICENSE' && 'bg-primary hover:bg-primary/90')}
			>
				License
			</Button>
			<Button
				variant={selectedDocumentType === 'CERTIFICATE' ? 'default' : 'outline'}
				size="sm"
				on:click={() => (selectedDocumentType = 'CERTIFICATE')}
				class={cn(selectedDocumentType === 'CERTIFICATE' && 'bg-purple-500 hover:bg-purple-600')}
			>
				Certificate
			</Button>
			<Button
				variant={selectedDocumentType === 'OTHER' ? 'default' : 'outline'}
				size="sm"
				on:click={() => (selectedDocumentType = 'OTHER')}
				class={cn(selectedDocumentType === 'OTHER' && 'bg-gray-500 hover:bg-gray-600')}
			>
				Other
			</Button>
		</div>
	</div>

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
											type="button"
											variant="outline"
											size="sm"
											on:click={() => handleDownload(row.original.uploadUrl, row.original.filename)}
											title="View/Download Document"
										>
											<ExternalLink size={16} />
										</Button>
										<form method="POST" use:enhanceAction action="?/deleteDocument">
											<Button type="submit" variant="destructive" size="sm" title="Delete Document">
												<Trash size={16} />
											</Button>
											<input type="hidden" name="id" value={row.original.id} />
										</form>
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
					)} of {$table.getRowModel().rows.length} documents
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
					<FileText class="w-8 h-8 text-gray-400" />
				</div>
				<h3 class="text-lg font-medium text-gray-900 mb-2">No documents found</h3>
				<p class="text-sm text-gray-500">
					{#if searchTerm}
						Try adjusting your search terms
					{:else if selectedDocumentType !== 'ALL'}
						No {selectedDocumentType.toLowerCase()} documents available
					{:else}
						No documents have been uploaded yet
					{/if}
				</p>
			</div>
		{/if}
	</div>
</section>
