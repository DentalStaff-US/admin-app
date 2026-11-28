<script lang="ts">
	import Papa from 'papaparse';
	import { CheckCircle2, FileUp, Loader2, MapPin, Trash2, XCircle } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';
	import { enhance } from '$app/forms';
	import ConfirmDialog from '$dtss/ConfirmDialog.svelte';
	import DataTable from '$dtss/DataTable.svelte';
	import Hint from '$dtss/Hint.svelte';
	import Notice from '$dtss/Notice.svelte';
	import Page from '$dtss/Page.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';
	import Section from '$dtss/Section.svelte';
	import type { DataColumn } from '$dtss/tableState';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import FormSelect from './FormSelect.svelte';
	import GeocodingStatusSection from './GeocodingStatusSection.svelte';
	import {
		IMPORT_ROLE_LABELS,
		REQUIRED_COLUMNS,
		parseImportRow,
		type ImportRole,
		type ParsedUser
	} from './userImport';

	type ImportResult = { success: number; skipped: number; errors: string[]; geocodingQueued?: number };

	let {
		isSuperadmin,
		initialRole = null,
		initialUsers = [],
		initialResult = null,
		poll = true
	}: {
		isSuperadmin: boolean;
		/** Fixture hooks for the dev preview. */
		initialRole?: ImportRole | null;
		initialUsers?: ParsedUser[];
		initialResult?: ImportResult | null;
		poll?: boolean;
	} = $props();

	let selectedRole = $state<string>(initialRole ?? '');
	let parsedUsers = $state<ParsedUser[]>(initialUsers);
	let importing = $state(false);
	let importResult = $state<ImportResult | null>(initialResult);
	let refreshKey = $state(0);
	let deleteOpen = $state(false);
	let fileInput = $state<HTMLInputElement>();

	const role = $derived((selectedRole || null) as ImportRole | null);
	const validUsers = $derived(parsedUsers.filter((u) => u.errors.length === 0));
	const invalidCount = $derived(parsedUsers.length - validUsers.length);
	const geocodeCount = $derived(validUsers.filter((u) => u.address).length);

	const ROLE_OPTIONS = (Object.keys(IMPORT_ROLE_LABELS) as ImportRole[]).map((r) => ({ value: r, label: IMPORT_ROLE_LABELS[r] }));

	function reset() {
		parsedUsers = [];
		importResult = null;
		if (fileInput) fileInput.value = '';
	}

	function handleFile(event: Event) {
		const file = (event.target as HTMLInputElement).files?.[0];
		if (!file || !role) return;
		Papa.parse(file, {
			header: true,
			skipEmptyLines: true,
			complete: (results) => {
				parsedUsers = (results.data as Record<string, unknown>[]).map((row) => parseImportRow(row, role));
				importResult = null;
			},
			error: (error) => toast.error(`Couldn't read that CSV: ${error.message}`)
		});
	}

	const columns = $derived<DataColumn<ParsedUser>[]>([
		{ id: 'status', header: 'Valid', cell: validCell },
		{ id: 'first', header: 'First name', value: (u) => u.firstName },
		{ id: 'last', header: 'Last name', value: (u) => u.lastName },
		{ id: 'email', header: 'Email', value: (u) => u.email },
		...(role === 'CLIENT' ? [{ id: 'company', header: 'Company', value: (u: ParsedUser) => u.companyName ?? '' }] : []),
		...(role === 'CLIENT' || role === 'CANDIDATE'
			? [{ id: 'address', header: 'Complete address', cell: addressCell }]
			: []),
		...(role === 'CANDIDATE'
			? [{ id: 'discipline', header: 'Discipline', value: (u: ParsedUser) => u.discipline || 'Not specified' }]
			: []),
		{ id: 'errors', header: 'Problems', cell: errorsCell }
	]);
</script>

{#snippet validCell(u: ParsedUser)}
	{#if u.errors.length}
		<XCircle class="size-4 text-destructive" aria-hidden="true" /><span class="sr-only">Invalid</span>
	{:else}
		<CheckCircle2 class="size-4 text-status-positive-fg" aria-hidden="true" /><span class="sr-only">Valid</span>
	{/if}
{/snippet}
{#snippet addressCell(u: ParsedUser)}
	{#if u.address}<Hint text={u.address} class="block max-w-xs truncate">{u.address}</Hint>{:else}<span class="text-muted-foreground">No address</span>{/if}
{/snippet}
{#snippet errorsCell(u: ParsedUser)}
	{#if u.errors.length}
		<ul class="list-disc pl-4 text-sm text-destructive">
			{#each u.errors as error (error)}<li>{error}</li>{/each}
		</ul>
	{/if}
{/snippet}
{#snippet mobile(u: ParsedUser)}
	<div class="flex items-start gap-3">
		<div class="mt-0.5">{@render validCell(u)}</div>
		<div class="min-w-0">
			<p class="font-semibold">{u.firstName} {u.lastName}</p>
			<p class="truncate text-sm text-muted-foreground">{u.email}</p>
			{#if u.companyName}<p class="text-sm text-muted-foreground">{u.companyName}</p>{/if}
			{#if role !== 'SUPERADMIN'}<p class="truncate text-sm text-muted-foreground">{u.address || 'No address'}</p>{/if}
			{@render errorsCell(u)}
		</div>
	</div>
{/snippet}

<Page>
	<PageHeader title="Import users" description="Add admins, practices or professionals in bulk from a CSV file.">
		{#snippet actions()}
			{#if isSuperadmin && parsedUsers.length > 0}
				<Button variant="destructiveOutline" on:click={() => (deleteOpen = true)}>
					<Trash2 class="mr-2 size-4" aria-hidden="true" /> Delete this CSV's users
				</Button>
			{/if}
		{/snippet}
	</PageHeader>

	{#if importResult}
		<Notice tone={importResult.errors.length ? 'warning' : 'positive'} title="Import complete">
			<p>{importResult.success} imported · {importResult.skipped} skipped as duplicates.</p>
			{#if importResult.geocodingQueued}
				<p class="mt-1 inline-flex items-center gap-1">
					<MapPin class="size-4" aria-hidden="true" />
					{importResult.geocodingQueued} {role === 'CLIENT' ? 'locations' : 'addresses'} queued for geocoding.
				</p>
			{/if}
			{#if importResult.errors.length}
				<p class="mt-2 font-semibold">Skipped</p>
				<ul class="list-disc pl-4">
					{#each importResult.errors as error (error)}<li>{error}</li>{/each}
				</ul>
			{/if}
		</Notice>
	{/if}

	{#if isSuperadmin}
		<GeocodingStatusSection lastImportQueued={importResult?.geocodingQueued ?? 0} {refreshKey} {poll} />
	{/if}

	<Section title="Upload">
		<div class="grid gap-5">
			<div class="grid max-w-xs gap-2">
				<Label for="import-role">Who are you importing?</Label>
				<FormSelect id="import-role" name="import-role" bind:value={selectedRole} options={ROLE_OPTIONS} placeholder="Choose a role" onchange={reset} />
			</div>

			{#if role}
				<div class="grid gap-2">
					<label
						for="csvFile"
						class="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors duration-fast hover:border-primary hover:bg-primary-soft focus-within:ring-2 focus-within:ring-ring"
					>
						<FileUp class="size-6 text-primary" aria-hidden="true" />
						<span class="font-semibold">Choose a CSV file</span>
						<span class="text-sm text-muted-foreground">Columns for {IMPORT_ROLE_LABELS[role].toLowerCase()} users: {REQUIRED_COLUMNS[role]}</span>
						<input bind:this={fileInput} type="file" id="csvFile" accept=".csv" class="sr-only" onchange={handleFile} />
					</label>
				</div>
			{/if}
		</div>
	</Section>

	{#if parsedUsers.length > 0}
		<section class="space-y-3">
			<div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<h2 class="text-h2">Preview ({parsedUsers.length})</h2>
					<p class="mt-1 text-sm text-muted-foreground">
						<span class="font-semibold text-status-positive-fg">{validUsers.length} valid</span> ·
						<span class={invalidCount ? 'font-semibold text-destructive' : ''}>{invalidCount} with problems</span>
						{geocodeCount ? ` · ${geocodeCount} ${role === 'CLIENT' ? 'locations' : 'professionals'} will be geocoded` : ''}
					</p>
				</div>
				<div class="flex flex-wrap gap-2">
					<Button variant="outline" on:click={reset}>Cancel</Button>
					<form
						method="POST"
						action="?/importUsers"
						use:enhance={() => {
							importing = true;
							return async ({ result, update }) => {
								importing = false;
								if (result.type === 'success' && result.data) {
									importResult = result.data as ImportResult;
									// Clear the preview but keep the result.
									parsedUsers = [];
									refreshKey += 1;
								}
								await update();
							};
						}}
					>
						<input type="hidden" name="role" value={role} />
						<input type="hidden" name="users" value={JSON.stringify(validUsers)} />
						<Button type="submit" disabled={validUsers.length === 0 || importing}>
							{#if importing}<Loader2 class="mr-2 size-4 animate-spin" aria-hidden="true" /> Importing…{:else}Import {validUsers.length} valid users{/if}
						</Button>
					</form>
				</div>
			</div>
			<DataTable rows={parsedUsers} {columns} key={(u) => `${u.email}-${u.firstName}-${u.lastName}`} caption="Users in this CSV" {mobile} />
		</section>
	{/if}
</Page>

<!-- Cleanup for a bad import. The server refuses the whole batch if any of these
     users already owns records of business; those must be suspended instead. -->
<ConfirmDialog
	bind:open={deleteOpen}
	title="Delete the {parsedUsers.length} users in this CSV?"
	description="Every account in this file that exists is permanently deleted. If any of them already has shifts, timesheets or invoices, nothing is deleted. This can't be undone."
	confirmText="DELETE"
>
	{#snippet confirm({ ready, typed })}
		<form
			method="POST"
			action="?/deleteAllUsers"
			use:enhance={() =>
				async ({ result, update }) => {
					if (result.type === 'success') {
						parsedUsers = [];
						deleteOpen = false;
					}
					await update();
				}}
		>
			<input type="hidden" name="emails" value={JSON.stringify(parsedUsers.map((u) => u.email))} />
			<input type="hidden" name="confirm" value={typed} />
			<Button type="submit" variant="destructive" class="min-h-11 w-full sm:min-h-10 sm:w-auto" disabled={!ready}>Delete users</Button>
		</form>
	{/snippet}
</ConfirmDialog>
