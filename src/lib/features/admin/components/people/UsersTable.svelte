<script lang="ts">
	import { checkIsAdmin } from '$lib/_helpers/checkIsAdmin';
	import { Ban, Check, ExternalLink, Search, ShieldCheck, Trash2, UserCog, Users, X } from 'lucide-svelte';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import ConfirmDialog from '$dtss/ConfirmDialog.svelte';
	import DataTable from '$dtss/DataTable.svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import StatusBadge from '$dtss/StatusBadge.svelte';
	import type { DataColumn } from '$dtss/tableState';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import {
		displayName,
		formatDate,
		profileHref,
		roleLabel,
		shortAddress,
		sortableName,
		type UserRow
	} from './people';

	let {
		users,
		total,
		page,
		limit,
		search = '',
		currentUserId,
		can = { ban: false, delete: false, impersonate: false },
		pageHref
	}: {
		users: UserRow[];
		total: number;
		page: number;
		limit: number;
		search?: string;
		currentUserId?: string | null;
		/** The viewer's account-action permissions (role matrix). The server re-checks each. */
		can?: { ban: boolean; delete: boolean; impersonate: boolean };
		pageHref: (page: number) => string;
	} = $props();

	type Pending = { kind: 'delete' | 'suspend' | 'reinstate' | 'impersonate'; user: UserRow } | null;
	let pending = $state<Pending>(null);
	let busy = $state(false);
	let banReason = $state('');
	let banDays = $state('');

	let deleteOpen = $state(false);
	let suspendOpen = $state(false);
	let reinstateOpen = $state(false);
	let impersonateOpen = $state(false);

	function open(kind: NonNullable<Pending>['kind'], user: UserRow) {
		pending = { kind, user };
		if (kind === 'delete') deleteOpen = true;
		if (kind === 'suspend') {
			banReason = '';
			banDays = '';
			suspendOpen = true;
		}
		if (kind === 'reinstate') reinstateOpen = true;
		if (kind === 'impersonate') impersonateOpen = true;
	}

	const isSelf = (row: UserRow) => row.id === currentUserId;
	// Never DTSS staff: the server refuses impersonating any admin.
	const canImpersonate = (row: UserRow) => can.impersonate && !isSelf(row) && !checkIsAdmin(row.role);
	const who = $derived(pending ? `${displayName(pending.user)} (${pending.user.email})` : '');

	const columns: DataColumn<UserRow>[] = [
		{ id: 'name', header: 'Name', cell: nameCell },
		{ id: 'role', header: 'Role', cell: roleCell },
		{ id: 'address', header: 'Address', value: (r) => shortAddress(r), class: 'whitespace-nowrap' },
		{ id: 'verified', header: 'Verified', cell: verifiedCell },
		{ id: 'onboarded', header: 'Onboarded', cell: onboardedCell },
		{ id: 'created', header: 'Created', value: (r) => formatDate(r.createdAt), class: 'tabular-nums whitespace-nowrap' },
		{ id: 'actions', header: 'Actions', srOnlyHeader: true, cell: actionsCell, class: 'text-right' }
	];

	// Shared enhance: close on success, refresh the list.
	function after(close: () => void) {
		busy = true;
		return async ({ result, update }: { result: { type: string }; update: () => Promise<void> }) => {
			busy = false;
			if (result.type === 'success') {
				close();
				pending = null;
			}
			await update();
			await invalidateAll();
		};
	}
</script>

{#snippet yesNo(value: boolean, label: string)}
	{#if value}
		<Check class="size-4 text-status-positive-fg" aria-hidden="true" /><span class="sr-only">{label}: yes</span>
	{:else}
		<X class="size-4 text-muted-foreground" aria-hidden="true" /><span class="sr-only">{label}: no</span>
	{/if}
{/snippet}
{#snippet verifiedCell(r: UserRow)}{@render yesNo(r.verified, 'Verified')}{/snippet}
{#snippet onboardedCell(r: UserRow)}{@render yesNo(r.completedOnboarding, 'Onboarded')}{/snippet}

{#snippet nameCell(r: UserRow)}
	<div class="flex flex-wrap items-center gap-2">
		<!-- The account page: profile, related records and account controls. -->
		<a href="/admin/menu/users/{r.id}" class="font-semibold text-primary-dark hover:underline">{sortableName(r)}</a>
		{#if r.banned}<StatusBadge status="ON_HOLD" label="Suspended" hint={r.banReason ?? undefined} />{/if}
	</div>
	<span class="block text-sm text-muted-foreground">{r.email}</span>
{/snippet}

{#snippet roleCell(r: UserRow)}
	<span class="block whitespace-nowrap">{roleLabel(r.role)}</span>
	{#if r.companyName}<span class="block text-sm text-muted-foreground">{r.companyName}</span>{/if}
{/snippet}

{#snippet actionsCell(r: UserRow)}
	{@const href = profileHref(r)}
	<div class="flex items-center justify-end gap-1">
		{#if href}
			<Button variant="ghost" size="icon" {href} aria-label="View profile of {displayName(r)}">
				<ExternalLink class="size-4" aria-hidden="true" />
			</Button>
		{/if}
		{#if canImpersonate(r)}
			<Button variant="ghost" size="icon" aria-label="Sign in as {displayName(r)}" on:click={() => open('impersonate', r)}>
				<UserCog class="size-4" aria-hidden="true" />
			</Button>
		{/if}
		{#if !can.ban}
			<!-- No suspend/reinstate for this viewer. -->
		{:else if r.banned}
			<Button variant="ghost" size="icon" aria-label="Reinstate {displayName(r)}" on:click={() => open('reinstate', r)}>
				<ShieldCheck class="size-4 text-status-positive-fg" aria-hidden="true" />
			</Button>
		{:else}
			<Button
				variant="ghost"
				size="icon"
				disabled={isSelf(r)}
				aria-label={isSelf(r) ? 'You cannot suspend your own account' : `Suspend ${displayName(r)}`}
				on:click={() => open('suspend', r)}
			>
				<Ban class="size-4 text-status-warning-fg" aria-hidden="true" />
			</Button>
		{/if}
		{#if can.delete}
			<Button
				variant="ghost"
				size="icon"
				disabled={isSelf(r)}
				aria-label={isSelf(r) ? 'You cannot delete your own account' : `Delete ${displayName(r)}`}
				on:click={() => open('delete', r)}
			>
				<Trash2 class="size-4 text-destructive" aria-hidden="true" />
			</Button>
		{/if}
	</div>
{/snippet}

{#snippet mobile(r: UserRow)}
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			{@render nameCell(r)}
			<p class="text-sm text-muted-foreground">
				{[roleLabel(r.role), r.companyName, shortAddress(r)].filter(Boolean).join(' · ')}
			</p>
			<p class="mt-1 text-caption text-muted-foreground">
				Joined {formatDate(r.createdAt)} · {r.verified ? 'Verified' : 'Not verified'} · {r.completedOnboarding ? 'Onboarded' : 'Not onboarded'}
			</p>
		</div>
		{@render actionsCell(r)}
	</div>
{/snippet}

{#snippet toolbar()}
	<form method="GET" class="flex flex-wrap items-center gap-2" role="search">
		<div class="relative w-full max-w-lg">
			<Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
			<Input
				name="search"
				value={search}
				aria-label="Search users"
				placeholder="Name, email, role, company, address or id"
				class="pl-9"
			/>
		</div>
		<Button type="submit" variant="outline">Search</Button>
		{#if search}<Button variant="ghost" href="?">Clear</Button>{/if}
		<p class="ml-auto text-sm text-muted-foreground">{total} {total === 1 ? 'user' : 'users'}</p>
	</form>
{/snippet}

{#snippet empty()}
	<EmptyState
		icon={Users}
		title={search ? `No users match “${search}”` : 'No users yet'}
		description={search ? 'Try a different name, email or id.' : 'People appear here as they sign up or are imported.'}
	>
		{#if search}<Button variant="outline" href="?">Clear search</Button>{:else}<Button href="/admin/menu/user-import">Import users</Button>{/if}
	</EmptyState>
{/snippet}

<DataTable
	rows={users}
	{columns}
	key={(r) => r.id}
	caption="All users"
	pagination={{ page, pageSize: limit, total, href: pageHref }}
	{toolbar}
	{empty}
	{mobile}
/>

<!-- Impersonation: a deliberate beat, and it's recorded. -->
<ConfirmDialog
	bind:open={impersonateOpen}
	title="Sign in as {pending ? displayName(pending.user) : 'this user'}?"
	description={pending?.user.role === 'CANDIDATE'
		? "Their professional portal opens in a new tab and this tab stays signed in as you. Everything you do there is recorded as you acting on their behalf."
		: "This tab switches to their account until you exit from the banner at the top. Everything you do is recorded as you acting on their behalf."}
>
	{#snippet confirm()}
		<form
			method="POST"
			action="?/impersonate"
			target={pending?.user.role === 'CANDIDATE' ? '_blank' : '_self'}
			use:enhance={() => {
				busy = true;
				return async ({ result, update }) => {
					busy = false;
					if (result.type === 'success' && result.data && typeof result.data.handoffUrl === 'string') {
						// Candidate: open the candidate-domain handoff in a new tab.
						impersonateOpen = false;
						window.open(result.data.handoffUrl, '_blank');
						return;
					}
					if (result.type === 'redirect') {
						// Same-app: the session cookie was swapped, so do a FULL load (not
						// goto) for the new session and its banner to be read server-side.
						window.location.href = result.location;
						return;
					}
					await update();
				};
			}}
		>
			<input type="hidden" name="id" value={pending?.user.id ?? ''} />
			<input type="hidden" name="role" value={pending?.user.role ?? ''} />
			<Button type="submit" class="min-h-11 w-full sm:min-h-10 sm:w-auto" disabled={busy}>
				{busy ? 'Starting…' : 'Sign in as user'}
			</Button>
		</form>
	{/snippet}
</ConfirmDialog>

<!-- Suspend: short form (reason + duration), so a Dialog. -->
<Dialog.Root bind:open={suspendOpen}>
	<Dialog.Content class="max-w-lg">
		<Dialog.Header>
			<Dialog.Title>Suspend {pending ? displayName(pending.user) : 'user'}?</Dialog.Title>
			<Dialog.Description>
				{who} is signed out and blocked from signing in. They see the reason and how long it lasts.
			</Dialog.Description>
		</Dialog.Header>
		<form method="POST" action="?/banUser" class="grid gap-4" use:enhance={() => after(() => (suspendOpen = false))}>
			<input type="hidden" name="id" value={pending?.user.id ?? ''} />
			<div class="grid gap-2">
				<Label for="ban-reason">Reason (shown to the user)</Label>
				<Input id="ban-reason" name="reason" bind:value={banReason} placeholder="e.g. Terms of service violation" />
			</div>
			<div class="grid gap-2">
				<Label for="ban-days">Duration in days</Label>
				<Input id="ban-days" name="days" type="number" min="1" bind:value={banDays} placeholder="Permanent" />
				<p class="text-sm text-muted-foreground">Leave blank for a permanent suspension.</p>
			</div>
			<Dialog.Footer class="gap-2">
				<Button type="button" variant="outline" on:click={() => (suspendOpen = false)}>Go back</Button>
				<Button type="submit" variant="destructive" disabled={busy}>{busy ? 'Suspending…' : 'Suspend user'}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<ConfirmDialog
	bind:open={reinstateOpen}
	title="Reinstate {pending ? displayName(pending.user) : 'this user'}?"
	description="The suspension is lifted and they can sign in again straight away."
>
	{#snippet confirm()}
		<form method="POST" action="?/unbanUser" use:enhance={() => after(() => (reinstateOpen = false))}>
			<input type="hidden" name="id" value={pending?.user.id ?? ''} />
			<Button type="submit" variant="success" class="min-h-11 w-full sm:min-h-10 sm:w-auto" disabled={busy}>Reinstate</Button>
		</form>
	{/snippet}
</ConfirmDialog>

<ConfirmDialog
	bind:open={deleteOpen}
	title="Delete {pending ? displayName(pending.user) : 'this user'}?"
	description="{who} and their profile, invoices, messages and notifications are permanently deleted. Audit history is kept but loses who it was. This can't be undone — to keep their history, suspend them instead."
	confirmText="DELETE"
>
	{#snippet confirm({ ready, typed })}
		<form method="POST" action="?/deleteUser" use:enhance={() => after(() => (deleteOpen = false))}>
			<input type="hidden" name="id" value={pending?.user.id ?? ''} />
			<input type="hidden" name="confirm" value={typed} />
			<Button type="submit" variant="destructive" class="min-h-11 w-full sm:min-h-10 sm:w-auto" disabled={!ready || busy}>
				{busy ? 'Deleting…' : 'Delete user'}
			</Button>
		</form>
	{/snippet}
</ConfirmDialog>
