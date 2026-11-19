<script lang="ts">
	import { format } from 'date-fns';
	import { ArrowLeftRight, Ban, ExternalLink, LogOut, ShieldCheck, Trash2, UserX } from 'lucide-svelte';
	import { enhance } from '$app/forms';
	import ActivityLog from '$lib/components/audit/ActivityLog.svelte';
	import ImpersonateButton from '$lib/components/admin/ImpersonateButton.svelte';
	import ConfirmDialog from '$dtss/ConfirmDialog.svelte';
	import FactGrid from '$dtss/FactGrid.svelte';
	import Page from '$dtss/Page.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';
	import Section from '$dtss/Section.svelte';
	import StatusBadge from '$dtss/StatusBadge.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import type { ActivityEntry } from '$lib/audit/constants';
	import { isStaffRole } from '$lib/authz';
	import {
		countLabel,
		deleteBlockers,
		isAnonymized,
		roleSwitchBlockers,
		roleSwitchTarget,
		signInMethodsLabel,
		switchRemovals,
		type AccountOverview
	} from './accountControls';
	import { displayName, formatDate, profileHref, roleLabel } from './people';

	let {
		overview,
		activity = null,
		isSelf = false,
		can
	}: {
		overview: AccountOverview;
		/** Null when the viewer can't read the ledger. */
		activity?: ActivityEntry[] | null;
		isSelf?: boolean;
		/** The viewer's permissions (role matrix). Every action re-checks on the server. */
		can: {
			ban: boolean;
			delete: boolean;
			changeRole: boolean;
			revokeSessions: boolean;
			impersonate: boolean;
			manageAdmins: boolean;
		};
	} = $props();

	const a = $derived(overview.account);
	const c = $derived(overview.counts);
	const name = $derived(displayName(a));
	const anonymized = $derived(isAnonymized(a.email));
	const staff = $derived(isStaffRole(a.role));
	const profileLink = $derived(
		profileHref({
			role: a.role,
			candidateProfileId: overview.professional?.profileId ?? null,
			clientProfileId: overview.practice?.profileId ?? overview.staffOf?.clientProfileId ?? null
		})
	);

	const switchTo = $derived(roleSwitchTarget(a.role));
	const switchBlocked = $derived(roleSwitchBlockers(a.role, c));
	const deleteBlocked = $derived(deleteBlockers(c));

	const when = (d: Date | string | null | undefined) => (d ? format(new Date(d), 'MMM d, yyyy h:mm a') : '—');
	const yes = (v: boolean | null | undefined) => (v ? 'Yes' : 'No');

	const businessRecords = $derived(
		[
			[c.requisitions, 'Requisitions'],
			[c.invoices, 'Invoices'],
			[c.clientTimesheets, 'Timesheets (as practice)'],
			[c.workdays, 'Shifts'],
			[c.candidateTimesheets, 'Timesheets (as professional)'],
			[c.applications, 'Applications'],
			[c.payouts, 'Partner payouts'],
			[c.commissions, 'Partner commissions']
		] as [number, string][]
	);
	const otherRecords = $derived(
		[
			[c.companies, 'Practices'],
			[c.locations, 'Locations'],
			[c.staffMembers, 'Staff accounts'],
			[c.clientDocuments, 'Practice documents'],
			[c.candidateDocuments, 'Professional documents'],
			[c.signatureRequests, 'Signature requests'],
			[c.conversations, 'Conversations'],
			[c.messagesSent, 'Messages sent'],
			[c.activeSessions, 'Active sessions']
		] as [number, string][]
	);

	let switchOpen = $state(false);
	let revokeOpen = $state(false);
	let suspendOpen = $state(false);
	let reinstateOpen = $state(false);
	let anonymizeOpen = $state(false);
	let deleteOpen = $state(false);
	let busy = $state(false);

	// Shared enhance: close on success, then refresh the page data.
	function after(close: () => void) {
		busy = true;
		return async ({ result, update }: { result: { type: string }; update: () => Promise<void> }) => {
			busy = false;
			if (result.type === 'success' || result.type === 'redirect') close();
			await update();
		};
	}
</script>

{#snippet recordList(rows: [number, string][])}
	<dl class="divide-y">
		{#each rows as [n, label] (label)}
			<div class="flex items-center justify-between gap-4 py-2 text-sm">
				<dt class={n ? '' : 'text-muted-foreground'}>{label}</dt>
				<dd class="font-bold tabular-nums {n ? '' : 'text-muted-foreground'}">{n}</dd>
			</div>
		{/each}
	</dl>
{/snippet}

{#snippet control(title: string, description: string, body: import('svelte').Snippet)}
	<div class="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
		<div class="min-w-0 max-w-xl">
			<h3 class="font-bold">{title}</h3>
			<p class="mt-0.5 text-sm text-muted-foreground">{description}</p>
		</div>
		<div class="shrink-0">{@render body()}</div>
	</div>
{/snippet}

{#snippet blockedList(items: string[], what: string)}
	<p class="max-w-xs text-sm text-muted-foreground">
		Can’t {what}: they have {items.join(', ')} on record.
	</p>
{/snippet}

<Page>
	<PageHeader title={name} description="{roleLabel(a.role)} · {a.email}">
		{#snippet actions()}
			{#if profileLink}
				<Button variant="outline" href={profileLink}>
					<ExternalLink class="mr-2 size-4" aria-hidden="true" /> Open {a.role === 'CANDIDATE' ? 'professional' : 'practice'} profile
				</Button>
			{/if}
			{#if can.impersonate && !staff && !isSelf && !anonymized}
				<ImpersonateButton userId={a.id} userName={name} crossApp={a.role === 'CANDIDATE'} size="default" />
			{/if}
		{/snippet}
	</PageHeader>

	{#if a.banned || anonymized || !a.verified}
		<div class="flex flex-wrap gap-2">
			{#if anonymized}<StatusBadge status="INACTIVE" label="Anonymized" />{:else if a.banned}<StatusBadge
					status="ON_HOLD"
					label={a.banExpires ? `Suspended until ${formatDate(a.banExpires)}` : 'Suspended'}
					hint={a.banReason ?? undefined}
				/>{/if}
			{#if !a.verified && !anonymized}<StatusBadge status="PENDING" label="Email not verified" />{/if}
		</div>
	{/if}

	<Section title="Account" description="The sign-in account. It's shared by every DTSS app and survives a role switch.">
		<FactGrid
			columns={3}
			facts={[
				{ label: 'Email', value: a.email },
				{ label: 'Email verified', value: yes(a.verified) },
				{ label: 'Joined', value: when(a.createdAt) },
				{ label: 'Sign-in methods', value: signInMethodsLabel(overview.signInMethods) },
				{ label: 'Two-factor', value: a.twoFactorEnabled ? 'On' : 'Off' },
				{ label: 'Last active', value: when(overview.lastActiveAt) },
				{ label: 'Active sessions', value: c.activeSessions },
				{ label: 'Onboarding', value: a.completedOnboarding ? 'Complete' : `Step ${a.onboardingStep ?? 1}` },
				{ label: 'Email / SMS campaigns', value: `${a.receiveEmail ? 'On' : 'Off'} / ${a.receiveSms ? 'On' : 'Off'}` }
			]}
		/>
		<p class="mt-3 text-caption text-muted-foreground">User ID <span class="font-mono">{a.id}</span></p>
	</Section>

	<Section title="Role profile" description={roleLabel(a.role)}>
		{#if overview.practice}
			<FactGrid
				columns={3}
				facts={[
					{ label: 'Practice status', value: overview.practice.status },
					{ label: 'Practices', value: overview.practice.companies.map((co) => co.name || 'Unnamed').join(', ') || 'None yet' },
					{ label: 'Locations', value: c.locations },
					{ label: 'Staff accounts', value: c.staffMembers },
					{ label: 'Cell phone', value: overview.practice.cellPhone },
					{ label: 'Billing customer', value: a.hasBillingCustomer ? 'Yes' : 'No' }
				]}
			/>
		{:else if overview.professional}
			<FactGrid
				columns={3}
				facts={[
					{ label: 'PUID', value: overview.professional.puid },
					{ label: 'Status', value: overview.professional.status },
					{ label: 'Approved', value: yes(overview.professional.approved) },
					{ label: 'Location', value: [overview.professional.city, overview.professional.state].filter(Boolean).join(', ') || null },
					{ label: 'Cell phone', value: overview.professional.cellPhone },
					{ label: 'Documents', value: c.candidateDocuments }
				]}
			/>
		{:else if overview.staffOf}
			<FactGrid
				columns={2}
				facts={[
					{ label: 'Practice', value: overview.staffOf.companyName },
					{ label: 'Staff role', value: roleLabel(overview.staffOf.staffRole) }
				]}
			/>
		{:else if staff}
			<p class="text-sm text-muted-foreground">
				A DTSS team member.
				{#if can.manageAdmins}<a class="font-semibold text-primary-dark hover:underline" href="/admin/menu/admins/{a.id}">Manage in Admins</a>.{/if}
			</p>
		{:else}
			<p class="text-sm text-muted-foreground">No profile yet. One is created when they start onboarding.</p>
		{/if}
		{#if overview.partner}
			<p class="mt-3 text-sm">
				Also a partner: <a class="font-semibold text-primary-dark hover:underline" href="/admin/menu/affiliates/{overview.partner.id}">partner #{overview.partner.pid}</a>
				({overview.partner.status.toLowerCase()}). Partner profiles stay through a role switch.
			</p>
		{/if}
	</Section>

	<div class="grid gap-6 lg:grid-cols-2">
		<Section title="Records of business" description="Kept for the books. Any of these block a role switch and a delete.">
			{@render recordList(businessRecords)}
		</Section>
		<Section title="Other related data" description="Removed with the profile when the role switches.">
			{@render recordList(otherRecords)}
		</Section>
	</div>

	{#if !staff && !isSelf && (can.changeRole || can.revokeSessions || can.ban || can.delete)}
		<Section title="Account controls" description="Every action here is recorded in the record history.">
			<div class="divide-y">
				{#if can.changeRole && switchTo && !anonymized}
					{#snippet switchBody()}
						{#if switchBlocked.length}
							{@render blockedList(switchBlocked, 'switch')}
						{:else}
							<Button variant="outline" on:click={() => (switchOpen = true)}>
								<ArrowLeftRight class="mr-2 size-4" aria-hidden="true" /> Make {roleLabel(switchTo).toLowerCase()}
							</Button>
						{/if}
					{/snippet}
					{@render control(
						`Switch to ${roleLabel(switchTo).toLowerCase()}`,
						`For someone who signed up as the wrong kind of user. Deletes their ${a.role === 'CLIENT' ? 'practice' : 'professional'} profile and everything under it, and keeps their sign-in. They set up a new ${switchTo === 'CANDIDATE' ? 'professional' : 'practice'} profile the next time they sign in.`,
						switchBody
					)}
				{/if}

				{#if can.revokeSessions && !anonymized}
					{#snippet revokeBody()}
						<Button variant="outline" disabled={!c.activeSessions} on:click={() => (revokeOpen = true)}>
							<LogOut class="mr-2 size-4" aria-hidden="true" /> Sign out everywhere
						</Button>
					{/snippet}
					{@render control(
						'Sign out everywhere',
						c.activeSessions ? `Ends ${countLabel(c.activeSessions, 'active session')} on every app and device.` : 'They have no active sessions.',
						revokeBody
					)}
				{/if}

				{#if can.ban && !anonymized}
					{#snippet banBody()}
						{#if a.banned}
							<Button variant="outline" on:click={() => (reinstateOpen = true)}>
								<ShieldCheck class="mr-2 size-4" aria-hidden="true" /> Reinstate
							</Button>
						{:else}
							<Button variant="outline" on:click={() => (suspendOpen = true)}>
								<Ban class="mr-2 size-4" aria-hidden="true" /> Suspend
							</Button>
						{/if}
					{/snippet}
					{@render control(
						a.banned ? 'Reinstate' : 'Suspend',
						a.banned ? 'Lift the suspension so they can sign in again.' : 'Sign them out and block sign-in, for a set time or permanently. Nothing is deleted.',
						banBody
					)}
				{/if}

				{#if can.delete && !anonymized}
					{#if deleteBlocked.length}
						{#snippet anonymizeBody()}
							<Button variant="destructiveOutline" on:click={() => (anonymizeOpen = true)}>
								<UserX class="mr-2 size-4" aria-hidden="true" /> Anonymize
							</Button>
						{/snippet}
						{@render control(
							'Remove personal data',
							`They have ${deleteBlocked.join(', ')} on record, so the account can't be deleted. Anonymizing removes their name, email, phone, address, credentials and message text, deletes their sign-in, and keeps the records of business under "Deleted user".`,
							anonymizeBody
						)}
					{:else}
						{#snippet deleteBody()}
							<Button variant="destructiveOutline" on:click={() => (deleteOpen = true)}>
								<Trash2 class="mr-2 size-4" aria-hidden="true" /> Delete account
							</Button>
						{/snippet}
						{@render control(
							'Delete account',
							'Permanently deletes their sign-in, profile, documents and messages. They have no records of business, so nothing the books need is lost.',
							deleteBody
						)}
					{/if}
				{/if}
			</div>
		</Section>
	{/if}

	{#if activity}
		<Section title="Account history">
			<ActivityLog entries={activity} emptyTitle="No account changes yet" emptyDescription="Role switches, suspensions and sign-outs appear here." />
		</Section>
	{/if}
</Page>

{#if switchTo}
	<ConfirmDialog
		bind:open={switchOpen}
		title="Make {name} a {roleLabel(switchTo).toLowerCase()}?"
		description="This deletes {switchRemovals(a.role, c).join(', ')}. Their sign-in stays: same email, same password, email still verified. They're signed out now and set up a {switchTo === 'CANDIDATE' ? 'professional profile in the professional app' : 'practice in the practice portal'} the next time they sign in. This can't be undone."
		confirmText="SWITCH"
	>
		{#snippet confirm({ ready, typed })}
			<form method="POST" action="?/switchRole" use:enhance={() => after(() => (switchOpen = false))}>
				<input type="hidden" name="to" value={switchTo} />
				<input type="hidden" name="confirm" value={typed} />
				<Button type="submit" class="min-h-11 w-full sm:min-h-10 sm:w-auto" disabled={!ready || busy}>
					{busy ? 'Switching…' : `Make ${roleLabel(switchTo).toLowerCase()}`}
				</Button>
			</form>
		{/snippet}
	</ConfirmDialog>
{/if}

<ConfirmDialog
	bind:open={revokeOpen}
	title="Sign {name} out everywhere?"
	description="Every session on every app and device ends. They can sign straight back in."
>
	{#snippet confirm()}
		<form method="POST" action="?/revokeSessions" use:enhance={() => after(() => (revokeOpen = false))}>
			<Button type="submit" class="min-h-11 w-full sm:min-h-10 sm:w-auto" disabled={busy}>Sign out everywhere</Button>
		</form>
	{/snippet}
</ConfirmDialog>

<Dialog.Root bind:open={suspendOpen}>
	<Dialog.Content class="max-w-lg">
		<Dialog.Header>
			<Dialog.Title>Suspend {name}?</Dialog.Title>
			<Dialog.Description>They're signed out and blocked from signing in. They see the reason and how long it lasts.</Dialog.Description>
		</Dialog.Header>
		<form method="POST" action="?/banUser" class="grid gap-4" use:enhance={() => after(() => (suspendOpen = false))}>
			<div class="grid gap-2">
				<Label for="ban-reason">Reason (shown to the user)</Label>
				<Input id="ban-reason" name="reason" placeholder="e.g. Terms of service violation" />
			</div>
			<div class="grid gap-2">
				<Label for="ban-days">Duration in days</Label>
				<Input id="ban-days" name="days" type="number" min="1" placeholder="Permanent" />
				<p class="text-sm text-muted-foreground">Leave blank for a permanent suspension.</p>
			</div>
			<Dialog.Footer class="gap-2">
				<Button type="button" variant="outline" on:click={() => (suspendOpen = false)}>Go back</Button>
				<Button type="submit" variant="destructive" disabled={busy}>{busy ? 'Suspending…' : 'Suspend user'}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<ConfirmDialog bind:open={reinstateOpen} title="Reinstate {name}?" description="The suspension is lifted and they can sign in again straight away.">
	{#snippet confirm()}
		<form method="POST" action="?/unbanUser" use:enhance={() => after(() => (reinstateOpen = false))}>
			<Button type="submit" variant="success" class="min-h-11 w-full sm:min-h-10 sm:w-auto" disabled={busy}>Reinstate</Button>
		</form>
	{/snippet}
</ConfirmDialog>

<ConfirmDialog
	bind:open={anonymizeOpen}
	title="Anonymize {name}?"
	description="Their name, email, phone, address, birthday, SSN digits, avatar, credentials (signed agreements are kept) and message text are removed, and their sign-in is deleted. Shifts, timesheets, invoices and practices stay on record under “Deleted user”. This can't be undone."
	confirmText="DELETE"
>
	{#snippet confirm({ ready, typed })}
		<form method="POST" action="?/anonymize" use:enhance={() => after(() => (anonymizeOpen = false))}>
			<input type="hidden" name="confirm" value={typed} />
			<Button type="submit" variant="destructive" class="min-h-11 w-full sm:min-h-10 sm:w-auto" disabled={!ready || busy}>
				{busy ? 'Anonymizing…' : 'Anonymize'}
			</Button>
		</form>
	{/snippet}
</ConfirmDialog>

<ConfirmDialog
	bind:open={deleteOpen}
	title="Delete {name}?"
	description="{name} ({a.email}), their profile, documents, messages and sign-in are permanently deleted. Account history is kept. This can't be undone."
	confirmText="DELETE"
>
	{#snippet confirm({ ready, typed })}
		<form method="POST" action="?/deleteUser" use:enhance={() => after(() => (deleteOpen = false))}>
			<input type="hidden" name="confirm" value={typed} />
			<Button type="submit" variant="destructive" class="min-h-11 w-full sm:min-h-10 sm:w-auto" disabled={!ready || busy}>
				{busy ? 'Deleting…' : 'Delete account'}
			</Button>
		</form>
	{/snippet}
</ConfirmDialog>
