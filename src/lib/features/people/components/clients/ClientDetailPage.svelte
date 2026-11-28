<script lang="ts">
	import { checkIsAdmin } from '$lib/_helpers/checkIsAdmin';
	import { can } from '$lib/authz';
	import { page } from '$app/state';
	import { env } from '$env/dynamic/public';
	import { AlertCircle, CreditCard, Pencil } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import Page from '$dtss/Page.svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import Section from '$dtss/Section.svelte';
	import StatusBadge from '$dtss/StatusBadge.svelte';
	import ImpersonateButton from '$lib/components/admin/ImpersonateButton.svelte';
	import AddRequisitionDrawer from '$lib/components/drawers/addRequisitionDrawer.svelte';
	import BlacklistSection from '../BlacklistSection.svelte';
	import DetailHeader from '../DetailHeader.svelte';
	import DetailTabs from '../DetailTabs.svelte';
	import HistoryTimeline from '../HistoryTimeline.svelte';
	import ProfileNotes from '../ProfileNotes.svelte';
	import StatusMenu from '../StatusMenu.svelte';
	import ToneBadge from '../ToneBadge.svelte';
	import BillingSetupButton from './BillingSetupButton.svelte';
	import ClientAgreements from './ClientAgreements.svelte';
	import ClientBillingSheet from './ClientBillingSheet.svelte';
	import ClientDocuments from './ClientDocuments.svelte';
	import ClientInvoices from './ClientInvoices.svelte';
	import ClientLocations from './ClientLocations.svelte';
	import ClientOverview from './ClientOverview.svelte';
	import ClientProfileSheet from './ClientProfileSheet.svelte';
	import ClientRequisitions from './ClientRequisitions.svelte';
	import ClientStaff from './ClientStaff.svelte';
	import ClientSupport from './ClientSupport.svelte';
	import InvoiceSheet from './InvoiceSheet.svelte';
	import { displayName, initialsOf, profileStatusLabel, readTab } from '../../people';

	/**
	 * The practice detail body (06 › Professionals / clients detail): header
	 * with logo, status and billing state; tabs as child components; edits in
	 * FormSheets. The page is DTSS-staff-only (the load redirects others); isAdmin
	 * means "staff admin", and actions an ADMIN lacks are gated with can().
	 */
	let { data, form = null }: { data: any; form?: Record<string, unknown> | null } = $props();

	const client = $derived(data.client);
	const isAdmin = $derived(checkIsAdmin(data.user?.role));
	// One-off invoices and un-blacklisting are SUPERADMIN-only in the role matrix.
	const canOneOffInvoice = $derived(can(data.user, 'invoices.oneOff'));
	const canRemoveBlacklist = $derived(can(data.user, 'blacklist.remove'));
	const practice = $derived(client?.company?.companyName || 'Practice');
	const owner = $derived(client ? displayName(client.user.firstName, client.user.lastName, client.user.email) : '');
	const paper = $derived(client?.profile?.clientInvoiceMethod === 'PAPER');
	// Only the internal instance creates Stripe customers from here (PUBLIC_APP_ENV is INTERNAL everywhere).
	const needsCustomerSetup = $derived(
		env.PUBLIC_APP_ENV === 'INTERNAL' &&
			!paper &&
			(!client?.subscription?.stripeCustomerId || client?.subscription?.stripeCustomerSetupPending)
	);

	const tabs = $derived([
		{ value: 'overview', label: 'Overview' },
		{ value: 'locations', label: 'Locations', count: client?.locations?.length ?? 0 },
		{ value: 'staff', label: 'Staff', count: (data.staff ?? []).length },
		{ value: 'requisitions', label: 'Requisitions', count: (data.requisitions ?? []).length },
		{ value: 'invoices', label: 'Invoices', count: (data.invoices ?? []).length },
		{ value: 'documents', label: 'Documents', count: (data.documents ?? []).length },
		...(isAdmin ? [{ value: 'notes', label: 'Notes', count: (data.comments ?? []).length }] : []),
		{ value: 'support', label: 'Support', count: (data.supportTickets ?? []).length },
		...(isAdmin ? [{ value: 'history', label: 'History' }] : [])
	]);
	let tab = $state('overview');
	$effect(() => {
		tab = readTab(page.url.searchParams.get('tab'), tabs.map((t) => t.value));
	});

	let profileOpen = $state(false);
	let billingOpen = $state(false);
	let invoiceOpen = $state(false);
	let requisitionOpen = $state(false);

	const blacklistSearchResult = $derived((form?.searchResult ?? null) as any);
	const blacklistSearchError = $derived((form?.searchError ?? null) as string | null);
</script>

{#if client}
	<Page>
		<DetailHeader
			title={practice}
			subtitle="Owner: {owner}"
			avatar={{ src: client.company?.companyLogo ?? client.user.avatarUrl, initials: (practice[0] ?? '?').toUpperCase(), kind: 'org' }}
			back={{ href: '/clients', label: 'Clients' }}
		>
			{#snippet meta()}
				<StatusBadge status={client.profile.status ?? 'PENDING'} label={profileStatusLabel(client.profile.status)} />
				{#if paper}<ToneBadge tone="neutral" label="Paper invoicing" hint="Every invoice for this practice is paper, even with a Stripe customer on file." />{/if}
				{#if needsCustomerSetup}<ToneBadge tone="warning" label="Payment setup pending" hint="No usable payment method yet. Send the setup link." />{/if}
			{/snippet}
			{#snippet actions()}
				{#if isAdmin}
					<!-- Always the account owner; staff have their own buttons on the Staff tab. -->
					<ImpersonateButton userId={client.user.id} userName="{owner} (account owner)" label="Sign in as owner" size="default" />
				{/if}
				{#if needsCustomerSetup}
					<BillingSetupButton clientId={client.profile.id} pending={!!client.subscription?.stripeCustomerSetupPending} ownerName={owner} ownerEmail={client.user.email} />
				{:else if canOneOffInvoice}
					<Button variant="outline" class="gap-2" on:click={() => (invoiceOpen = true)}><CreditCard class="size-4" aria-hidden="true" />Create invoice</Button>
				{/if}
				{#if isAdmin}
					<Button variant="outline" class="gap-2" on:click={() => (profileOpen = true)}><Pencil class="size-4" aria-hidden="true" />Edit</Button>
					<StatusMenu kind="client" name={practice} status={client.profile.status} />
				{/if}
			{/snippet}
		</DetailHeader>

		<DetailTabs {tabs} bind:value={tab} label="Practice sections">
			{#snippet children(active)}
				{#if active === 'overview'}
					<ClientOverview {client} {isAdmin} billingMismatchMessage={data.billingMismatchMessage} onEditProfile={() => (profileOpen = true)} onEditBilling={() => (billingOpen = true)} />
				{:else if active === 'locations'}
					<ClientLocations clientId={client.profile.id} locations={client.locations ?? []} company={client.company} locationForm={data.locationForm} {isAdmin} />
				{:else if active === 'staff'}
					<ClientStaff
						staff={data.staff ?? []}
						pendingInvites={data.pendingInvites ?? []}
						locations={(client.locations ?? []).map((l: any) => ({ id: l.id, name: l.name }))}
						companyName={practice}
						{isAdmin}
					/>
				{:else if active === 'requisitions'}
					<ClientRequisitions requisitions={data.requisitions ?? []} recurrenceDays={data.recurrenceDays ?? []} {isAdmin} onNew={() => (requisitionOpen = true)} />
				{:else if active === 'invoices'}
					<ClientInvoices invoices={data.invoices ?? []} onNew={needsCustomerSetup || !canOneOffInvoice ? undefined : () => (invoiceOpen = true)} />
				{:else if active === 'documents'}
					<div class="space-y-6">
						{#if isAdmin}<ClientAgreements signatureRequests={data.signatureRequests ?? []} signatureKinds={data.signatureKinds ?? []} />{/if}
						<ClientDocuments documents={data.documents ?? []} {isAdmin} />
					</div>
				{:else if active === 'notes'}
					<div class="space-y-6">
						<Section title="Notes" description="Visible to DTSS admins only.">
							<ProfileNotes comments={data.comments ?? []} currentUserId={data.user.id} addAction="?/addComment" deleteAction="?/deleteComment" />
						</Section>
						<Section title="Blacklisted professionals" description="Never matched with this practice.">
							<BlacklistSection
								practiceName={practice}
								blacklistedCandidates={data.blacklistedCandidates ?? []}
								searchResult={blacklistSearchResult}
								searchError={blacklistSearchError}
								searchAction="?/searchBlacklistCandidate"
								addAction="?/addBlacklist"
								removeAction={canRemoveBlacklist ? '?/removeBlacklist' : undefined}
							/>
						</Section>
					</div>
				{:else if active === 'support'}
					<ClientSupport tickets={data.supportTickets ?? []} />
				{:else if active === 'history'}
					<Section title="Account activity" description="The owner's sign-ins and actions taken on their account, newest first.">
						<HistoryTimeline entries={data.activity ?? []} emptyDescription="Sign-ins and account changes are recorded here." />
					</Section>
				{/if}
			{/snippet}
		</DetailTabs>
	</Page>

	{#if isAdmin}
		<ClientProfileSheet bind:open={profileOpen} form={data.updateClientForm} logo={client.company?.companyLogo} />
		<ClientBillingSheet bind:open={billingOpen} form={data.updateClientForm} accountEmail={client.user.email} hasStripeCustomer={!!client.subscription?.stripeCustomerId} />
	{/if}
	<InvoiceSheet
		bind:open={invoiceOpen}
		form={data.invoiceForm}
		defaultMethod={paper ? 'PAPER' : 'STRIPE'}
		permanentRequisitions={data.permanentRequisitions ?? []}
		billingMismatch={!!data.billingMismatchMessage}
	/>
	<AddRequisitionDrawer currentCompanyID={client.company?.id} user={data.user} bind:drawerExpanded={requisitionOpen} adminForm={data.requisitionForm} />
{:else}
	<Page width="narrow">
		<EmptyState icon={AlertCircle} title="Client not found" description="This practice couldn't be found. It may have been removed.">
			<Button href="/clients">Back to clients</Button>
		</EmptyState>
	</Page>
{/if}
