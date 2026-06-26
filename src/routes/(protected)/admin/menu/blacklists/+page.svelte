<script lang="ts">
	import * as Table from '$lib/components/ui/table';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import {
		AlertDialog,
		AlertDialogAction,
		AlertDialogCancel,
		AlertDialogContent,
		AlertDialogDescription,
		AlertDialogFooter,
		AlertDialogHeader,
		AlertDialogTitle
	} from '$lib/components/ui/alert-dialog';
	import type { PageData } from './$types';
	import { ChevronLeft, ChevronRight, Ban, Trash2, ExternalLink } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';

	export let data: PageData;

	type BlacklistRow = {
		candidateId: string;
		companyId: string;
		firstName: string | null;
		lastName: string | null;
		email: string;
		avatarUrl: string | null;
		companyName: string | null;
		createdAt: string | Date;
	};

	$: entries = (data.entries as BlacklistRow[]) || [];
	$: total = data.total ?? 0;
	$: page = data.page ?? 1;
	$: limit = data.limit ?? 25;
	$: totalPages = Math.max(1, Math.ceil(total / limit));

	let searchTerm = data.search ?? '';
	let removeDialogOpen = false;
	let pendingRemove: BlacklistRow | null = null;
	let removing = false;

	function fullName(row: BlacklistRow): string {
		return `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim() || '(no name)';
	}

	function formatDate(d: string | Date): string {
		const date = typeof d === 'string' ? new Date(d) : d;
		return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date
			.getDate()
			.toString()
			.padStart(2, '0')}/${date.getFullYear()}`;
	}

	function handleSearch(term: string) {
		const params = new URLSearchParams();
		if (term.trim()) params.set('search', term.trim());
		goto(`/admin/menu/blacklists${params.toString() ? `?${params}` : ''}`);
	}

	function goToPage(p: number) {
		const params = new URLSearchParams();
		if (searchTerm.trim()) params.set('search', searchTerm.trim());
		if (p > 1) params.set('page', String(p));
		goto(`/admin/menu/blacklists${params.toString() ? `?${params}` : ''}`);
	}

	function openRemove(row: BlacklistRow) {
		pendingRemove = row;
		removeDialogOpen = true;
	}
</script>

<section class="flex flex-col h-full p-6 space-y-6">
	<!-- Header -->
	<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Candidate Blacklists</h1>
			<p class="text-muted-foreground">
				Every candidate↔company block across all clients. Add new blocks from a client's profile
				page; remove them here or there.
			</p>
		</div>
	</div>

	<!-- Search -->
	<form on:submit|preventDefault={() => handleSearch(searchTerm)} class="flex items-center gap-2">
		<Input
			bind:value={searchTerm}
			placeholder="Search by candidate name, email, or company..."
			class="bg-white max-w-lg"
		/>
		<Button size="sm" class="bg-primary hover:bg-primary/90" type="submit">Search</Button>
		{#if searchTerm}
			<Button
				size="sm"
				variant="outline"
				type="button"
				on:click={() => {
					searchTerm = '';
					handleSearch('');
				}}
			>
				Clear
			</Button>
		{/if}
	</form>

	<div class="flex items-center gap-2 text-sm text-muted-foreground">
		<Ban class="h-4 w-4" />
		<span>{total} {total === 1 ? 'entry' : 'entries'} total</span>
	</div>

	<!-- Table -->
	<div class="bg-white rounded-lg shadow-sm flex flex-col">
		{#if entries.length > 0}
			<div class="rounded-md border overflow-x-auto">
				<Table.Root>
					<Table.Header>
						<Table.Row class="bg-white">
							<Table.Head>Candidate</Table.Head>
							<Table.Head>Email</Table.Head>
							<Table.Head>Company</Table.Head>
							<Table.Head>Blacklisted</Table.Head>
							<Table.Head class="text-right">Actions</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each entries as row (row.candidateId + row.companyId)}
							<Table.Row class="bg-gray-50 hover:bg-gray-100">
								<Table.Cell class="font-medium">{fullName(row)}</Table.Cell>
								<Table.Cell>{row.email}</Table.Cell>
								<Table.Cell>{row.companyName ?? '—'}</Table.Cell>
								<Table.Cell>{formatDate(row.createdAt)}</Table.Cell>
								<Table.Cell class="text-right">
									<div class="flex items-center justify-end gap-2">
										<Button
											variant="ghost"
											size="sm"
											on:click={() => goto(`/professionals/${row.candidateId}`)}
											title="View professional"
										>
											<ExternalLink class="h-4 w-4" />
										</Button>
										<Button
											variant="ghost"
											size="sm"
											class="text-red-600 hover:text-red-700 hover:bg-red-50"
											on:click={() => openRemove(row)}
											title="Remove from blacklist"
										>
											<Trash2 class="h-4 w-4" />
										</Button>
									</div>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>

			<!-- Pagination (server-side) -->
			<div class="flex items-center justify-between space-x-2 p-4 border-t">
				<div class="flex-1 text-sm text-muted-foreground">
					Page {page} of {totalPages} — showing {(page - 1) * limit + 1} to {Math.min(
						page * limit,
						total
					)} of {total}
				</div>
				<div class="flex items-center space-x-2">
					<Button variant="outline" size="sm" on:click={() => goToPage(page - 1)} disabled={page <= 1}>
						<ChevronLeft class="h-4 w-4" /> Previous
					</Button>
					<Button
						variant="outline"
						size="sm"
						on:click={() => goToPage(page + 1)}
						disabled={page >= totalPages}
					>
						Next <ChevronRight class="h-4 w-4" />
					</Button>
				</div>
			</div>
		{:else}
			<div class="flex flex-col items-center justify-center py-12 text-center flex-1">
				<div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
					<Ban class="w-8 h-8 text-gray-400" />
				</div>
				<h3 class="text-lg font-medium text-gray-900 mb-2">No blacklist entries</h3>
				<p class="text-sm text-gray-500">
					{searchTerm ? 'Try adjusting your search terms.' : 'No candidates are blacklisted yet.'}
				</p>
			</div>
		{/if}
	</div>
</section>

<!-- ─── Remove confirmation ─────────────────────────────────────────────────── -->
<AlertDialog bind:open={removeDialogOpen}>
	<AlertDialogContent>
		<AlertDialogHeader>
			<AlertDialogTitle>Remove from blacklist?</AlertDialogTitle>
			<AlertDialogDescription>
				{#if pendingRemove}
					This will let <strong>{fullName(pendingRemove)}</strong> ({pendingRemove.email}) be matched
					with <strong>{pendingRemove.companyName ?? 'this company'}</strong> again. Previously
					cancelled shifts are not restored.
				{/if}
			</AlertDialogDescription>
		</AlertDialogHeader>
		<AlertDialogFooter>
			<AlertDialogCancel>Cancel</AlertDialogCancel>
			<form
				method="POST"
				action="?/removeBlacklist"
				use:enhance={() => {
					removing = true;
					return async ({ result, update }) => {
						removing = false;
						if (result.type === 'success') {
							removeDialogOpen = false;
							pendingRemove = null;
						}
						await update();
					};
				}}
			>
				<input type="hidden" name="candidateId" value={pendingRemove?.candidateId ?? ''} />
				<input type="hidden" name="companyId" value={pendingRemove?.companyId ?? ''} />
				<AlertDialogAction
					type="submit"
					class="bg-destructive hover:bg-destructive/90 text-white"
					disabled={removing}
				>
					{removing ? 'Removing...' : 'Remove'}
				</AlertDialogAction>
			</form>
		</AlertDialogFooter>
	</AlertDialogContent>
</AlertDialog>
