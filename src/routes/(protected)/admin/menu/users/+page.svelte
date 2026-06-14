<script lang="ts">
	import {
		getCoreRowModel,
		type ColumnDef,
		getSortedRowModel,
		type TableOptions,
		createSvelteTable,
		flexRender
	} from '@tanstack/svelte-table';
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
	import { writable } from 'svelte/store';
	import { onMount } from 'svelte';
	import {
		ChevronLeft,
		ChevronRight,
		Users,
		Trash2,
		Check,
		X,
		ExternalLink,
		UserCog,
		Ban,
		ShieldCheck
	} from 'lucide-svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { enhance } from '$app/forms';
	import { USER_ROLES } from '$lib/config/constants';

	export let data: PageData;

	type UserRow = {
		id: string;
		firstName: string | null;
		lastName: string | null;
		email: string;
		role: string;
		verified: boolean;
		completedOnboarding: boolean;
		banned: boolean | null;
		banReason: string | null;
		banExpires: string | Date | null;
		createdAt: string | Date;
		companyName: string | null;
		city: string | null;
		state: string | null;
		fullAddress: string | null;
		candidateProfileId: string | null;
		clientProfileId: string | null;
	};

	$: users = (data.users as UserRow[]) || [];
	$: total = data.total ?? 0;
	$: page = data.page ?? 1;
	$: limit = data.limit ?? 25;
	$: totalPages = Math.max(1, Math.ceil(total / limit));

	let searchTerm = data.search ?? '';
	let tableData: UserRow[] = [];
	let deleteDialogOpen = false;
	let pendingDeleteUser: UserRow | null = null;
	let deleting = false;

	// Ban dialog state
	let banDialogOpen = false;
	let pendingBanUser: UserRow | null = null;
	let banReason = '';
	let banDays = '';
	let banning = false;

	function openBan(row: UserRow) {
		pendingBanUser = row;
		banReason = '';
		banDays = '';
		banDialogOpen = true;
	}

	function canImpersonate(row: UserRow): boolean {
		return row.id !== data.user?.id && row.role !== USER_ROLES.SUPERADMIN;
	}

	// Profile-page link per role. Routes expect the PROFILE id (not user.id):
	//   /professionals/[id] reads candidate_profiles.id
	//   /clients/[id]       reads client_profiles.id (parent profile for CLIENT_STAFF)
	// SUPERADMIN currently has no detail page in this nav, so we omit the link.
	function profileHref(row: UserRow): string | null {
		if (row.role === USER_ROLES.CANDIDATE && row.candidateProfileId)
			return `/professionals/${row.candidateProfileId}`;
		if (
			(row.role === USER_ROLES.CLIENT || row.role === USER_ROLES.CLIENT_STAFF) &&
			row.clientProfileId
		)
			return `/clients/${row.clientProfileId}`;
		return null;
	}

	function formatDate(d: string | Date): string {
		const date = typeof d === 'string' ? new Date(d) : d;
		return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date
			.getDate()
			.toString()
			.padStart(2, '0')}/${date.getFullYear()}`;
	}

	function shortAddress(row: UserRow): string {
		if (!row.city && !row.state) return '';
		return [row.city, row.state].filter(Boolean).join(', ');
	}

	const columns: ColumnDef<UserRow>[] = [
		{
			header: 'Name',
			id: 'name',
			accessorFn: (row) =>
				`${row.lastName ?? ''}${row.lastName && row.firstName ? ', ' : ''}${row.firstName ?? ''}`.trim() ||
				'(no name)'
		},
		{ header: 'Email', id: 'email', accessorKey: 'email' },
		{ header: 'Role', id: 'role', accessorKey: 'role' },
		{
			header: 'Company',
			id: 'companyName',
			accessorFn: (row) => row.companyName ?? ''
		},
		{
			header: 'Address',
			id: 'address',
			accessorFn: (row) => shortAddress(row)
		},
		{
			header: 'Verified',
			id: 'verified',
			accessorFn: (row) => (row.verified ? 'yes' : 'no')
		},
		{
			header: 'Onboarded',
			id: 'completedOnboarding',
			accessorFn: (row) => (row.completedOnboarding ? 'yes' : 'no')
		},
		{
			header: 'Created',
			id: 'createdAt',
			accessorFn: (row) => formatDate(row.createdAt)
		}
	];

	const options = writable<TableOptions<UserRow>>({
		data: tableData,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel()
	});

	$: {
		tableData = users;
		options.update((o) => ({ ...o, data: tableData }));
	}

	onMount(() => {
		tableData = users;
		options.update((o) => ({ ...o, data: tableData }));
	});

	const table = createSvelteTable(options);

	function handleSearch(term: string) {
		const params = new URLSearchParams();
		if (term.trim()) params.set('search', term.trim());
		goto(`/admin/menu/users${params.toString() ? `?${params}` : ''}`);
	}

	function goToPage(p: number) {
		const params = new URLSearchParams();
		if (searchTerm.trim()) params.set('search', searchTerm.trim());
		if (p > 1) params.set('page', String(p));
		goto(`/admin/menu/users${params.toString() ? `?${params}` : ''}`);
	}

	function openDelete(row: UserRow) {
		pendingDeleteUser = row;
		deleteDialogOpen = true;
	}
</script>

<section class="flex flex-col h-full p-6 space-y-6">
	<!-- Header -->
	<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">All Users</h1>
			<p class="text-muted-foreground">
				Search, inspect, and delete users across every role.
			</p>
		</div>
	</div>

	<!-- Search -->
	<form on:submit|preventDefault={() => handleSearch(searchTerm)} class="flex items-center gap-2">
		<Input
			bind:value={searchTerm}
			placeholder="Search by name, email, role, company, address, or id..."
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
		<Users class="h-4 w-4" />
		<span>{total} {total === 1 ? 'user' : 'users'} total</span>
	</div>

	<!-- Table -->
	<div class="bg-white rounded-lg shadow-sm flex flex-col">
		{#if users.length > 0}
			<div class="rounded-md border overflow-x-auto">
				<Table.Root>
					<Table.Header>
						{#each $table.getHeaderGroups() as headerGroup}
							<Table.Row class="bg-white">
								{#each headerGroup.headers as header}
									<Table.Head>{header.column.columnDef.header}</Table.Head>
								{/each}
								<Table.Head class="text-right">Actions</Table.Head>
							</Table.Row>
						{/each}
					</Table.Header>
					<Table.Body>
						{#each $table.getRowModel().rows as row}
							{@const href = profileHref(row.original)}
							<Table.Row class="bg-gray-50 hover:bg-gray-100">
								{#each row.getVisibleCells() as cell}
									{@const colId = cell.column.id}
									<Table.Cell>
										{#if colId === 'verified' || colId === 'completedOnboarding'}
											{#if cell.getValue() === 'yes'}
												<Check class="h-4 w-4 text-green-600" />
											{:else}
												<X class="h-4 w-4 text-gray-400" />
											{/if}
										{:else if colId === 'address'}
											<span title={row.original.fullAddress ?? ''}>{cell.getValue()}</span>
										{:else}
											<svelte:component
												this={flexRender(cell.column.columnDef.cell, cell.getContext())}
											/>
										{/if}
									</Table.Cell>
								{/each}
								<Table.Cell class="text-right">
									<div class="flex items-center justify-end gap-2">
										{#if href}
											<Button
												variant="ghost"
												size="sm"
												on:click={() => goto(href)}
												title="View profile"
											>
												<ExternalLink class="h-4 w-4" />
											</Button>
										{/if}

										<!-- Impersonate (cross-app for candidates opens a new tab) -->
										{#if canImpersonate(row.original)}
											<form
												method="POST"
												action="?/impersonate"
												target={row.original.role === USER_ROLES.CANDIDATE ? '_blank' : '_self'}
												use:enhance={() => {
													return async ({ result, update }) => {
														if (
															result.type === 'success' &&
															result.data &&
															typeof result.data.handoffUrl === 'string'
														) {
															// Candidate: open the candidate-domain handoff in a new tab.
															window.open(result.data.handoffUrl, '_blank');
															return;
														}
														await update();
													};
												}}
											>
												<input type="hidden" name="id" value={row.original.id} />
												<input type="hidden" name="role" value={row.original.role} />
												<Button
													variant="ghost"
													size="sm"
													type="submit"
													class="text-blue-700 hover:bg-blue-50"
													title="Impersonate user"
												>
													<UserCog class="h-4 w-4" />
												</Button>
											</form>
										{/if}

										<!-- Ban / Unban -->
										{#if row.original.banned}
											<form
												method="POST"
												action="?/unbanUser"
												use:enhance={() => async ({ update }) => {
													await update();
													await invalidateAll();
												}}
											>
												<input type="hidden" name="id" value={row.original.id} />
												<Button
													variant="ghost"
													size="sm"
													type="submit"
													class="text-green-700 hover:bg-green-50"
													title="Reinstate user"
												>
													<ShieldCheck class="h-4 w-4" />
												</Button>
											</form>
										{:else}
											<Button
												variant="ghost"
												size="sm"
												class="text-amber-700 hover:bg-amber-50"
												on:click={() => openBan(row.original)}
												disabled={row.original.id === data.user?.id}
												title={row.original.id === data.user?.id
													? 'You cannot suspend your own account'
													: 'Suspend user'}
											>
												<Ban class="h-4 w-4" />
											</Button>
										{/if}

										<Button
											variant="ghost"
											size="sm"
											class="text-red-600 hover:text-red-700 hover:bg-red-50"
											on:click={() => openDelete(row.original)}
											disabled={row.original.id === data.user?.id}
											title={row.original.id === data.user?.id
												? 'You cannot delete your own account'
												: 'Delete user'}
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
					<Button
						variant="outline"
						size="sm"
						on:click={() => goToPage(page - 1)}
						disabled={page <= 1}
					>
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
					<Users class="w-8 h-8 text-gray-400" />
				</div>
				<h3 class="text-lg font-medium text-gray-900 mb-2">No users found</h3>
				<p class="text-sm text-gray-500">
					{searchTerm ? 'Try adjusting your search terms.' : 'No users in the system.'}
				</p>
			</div>
		{/if}
	</div>
</section>

<!-- ─── Ban / suspend ───────────────────────────────────────────────────────── -->
<AlertDialog bind:open={banDialogOpen}>
	<AlertDialogContent>
		<AlertDialogHeader>
			<AlertDialogTitle>Suspend user?</AlertDialogTitle>
			<AlertDialogDescription>
				{#if pendingBanUser}
					This will suspend <strong>
						{pendingBanUser.firstName ?? ''} {pendingBanUser.lastName ?? ''}
					</strong> ({pendingBanUser.email}). They will be signed out and blocked from logging in,
					and shown the reason + duration below.
				{/if}
			</AlertDialogDescription>
		</AlertDialogHeader>

		<div class="grid gap-3 py-2">
			<label class="text-sm font-medium" for="ban-reason">Reason (shown to the user)</label>
			<Input id="ban-reason" bind:value={banReason} placeholder="e.g. Terms of service violation" />
			<label class="text-sm font-medium" for="ban-days">Duration in days (blank = permanent)</label>
			<Input id="ban-days" type="number" min="1" bind:value={banDays} placeholder="Permanent" />
		</div>

		<AlertDialogFooter>
			<AlertDialogCancel>Cancel</AlertDialogCancel>
			<form
				method="POST"
				action="?/banUser"
				use:enhance={() => {
					banning = true;
					return async ({ result, update }) => {
						banning = false;
						if (result.type === 'success') {
							banDialogOpen = false;
							pendingBanUser = null;
						}
						await update();
						await invalidateAll();
					};
				}}
			>
				<input type="hidden" name="id" value={pendingBanUser?.id ?? ''} />
				<input type="hidden" name="reason" value={banReason} />
				<input type="hidden" name="days" value={banDays} />
				<AlertDialogAction
					type="submit"
					class="bg-amber-600 hover:bg-amber-700 text-white"
					disabled={banning}
				>
					{banning ? 'Suspending...' : 'Suspend'}
				</AlertDialogAction>
			</form>
		</AlertDialogFooter>
	</AlertDialogContent>
</AlertDialog>

<!-- ─── Delete confirmation ─────────────────────────────────────────────────── -->
<AlertDialog bind:open={deleteDialogOpen}>
	<AlertDialogContent>
		<AlertDialogHeader>
			<AlertDialogTitle>Delete user?</AlertDialogTitle>
			<AlertDialogDescription>
				{#if pendingDeleteUser}
					This will permanently delete <strong>
						{pendingDeleteUser.firstName ?? ''} {pendingDeleteUser.lastName ?? ''}
					</strong> ({pendingDeleteUser.email}) and cascade-delete their profile, invoices,
					messages, and notifications. Audit-history rows are preserved but lose the attributed
					user. This action cannot be undone.
				{/if}
			</AlertDialogDescription>
		</AlertDialogHeader>
		<AlertDialogFooter>
			<AlertDialogCancel>Cancel</AlertDialogCancel>
			<form
				method="POST"
				action="?/deleteUser"
				use:enhance={() => {
					deleting = true;
					return async ({ result, update }) => {
						deleting = false;
						if (result.type === 'success') {
							deleteDialogOpen = false;
							pendingDeleteUser = null;
						}
						await update();
					};
				}}
			>
				<input type="hidden" name="id" value={pendingDeleteUser?.id ?? ''} />
				<AlertDialogAction
					type="submit"
					class="bg-destructive hover:bg-destructive/90 text-white"
					disabled={deleting}
				>
					{deleting ? 'Deleting...' : 'Delete'}
				</AlertDialogAction>
			</form>
		</AlertDialogFooter>
	</AlertDialogContent>
</AlertDialog>
