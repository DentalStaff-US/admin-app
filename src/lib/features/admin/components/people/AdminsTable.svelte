<script lang="ts">
	import { Search, Shield } from 'lucide-svelte';
	import DataTable from '$dtss/DataTable.svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import type { DataColumn } from '$dtss/tableState';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { roleLabel } from './people';

	export type AdminRow = {
		id: string;
		firstName: string | null;
		lastName: string | null;
		email: string;
		avatarUrl?: string | null;
		role: string;
	};

	let { admins, search = '' }: { admins: AdminRow[]; search?: string } = $props();

	const name = (r: AdminRow) => [r.lastName, r.firstName].filter(Boolean).join(', ') || r.email;

	const columns: DataColumn<AdminRow>[] = [
		{ id: 'name', header: 'Name', value: name },
		{ id: 'email', header: 'Email', value: (r) => r.email },
		{ id: 'role', header: 'Role', value: (r) => roleLabel(r.role) }
	];
</script>

{#snippet toolbar()}
	<form method="GET" class="flex flex-wrap items-center gap-2" role="search">
		<div class="relative w-full max-w-xs">
			<Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
			<Input name="search" value={search} aria-label="Search admins" placeholder="Search admins" class="pl-9" />
		</div>
		<Button type="submit" variant="outline">Search</Button>
		{#if search}<Button variant="ghost" href="?">Clear</Button>{/if}
		<p class="ml-auto text-sm text-muted-foreground">
			{admins.length} {admins.length === 1 ? 'administrator' : 'administrators'}
		</p>
	</form>
{/snippet}

{#snippet empty()}
	<EmptyState
		icon={Shield}
		title={search ? `No admins match “${search}”` : 'No administrators yet'}
		description={search ? 'Try a different name or email.' : 'Invite a colleague to help run DTSS.'}
	>
		{#if search}<Button variant="outline" href="?">Clear search</Button>{/if}
	</EmptyState>
{/snippet}

<DataTable
	rows={admins}
	{columns}
	key={(r) => r.id}
	caption="Administrators"
	rowHref={(r) => `/admin/menu/admins/${r.id}`}
	rowLabel={(r) => `Open ${name(r)}`}
	{toolbar}
	{empty}
/>
