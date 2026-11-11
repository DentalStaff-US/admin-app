<script lang="ts">
	// Practice owners and staff (10 §4): see who's coming, approve hours, post a
	// need. One layout for every practice role; the scope decides what's in it.
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { formatInTimeZone } from 'date-fns-tz';
	import { Plus } from 'lucide-svelte';
	import type { SuperValidated } from 'sveltekit-superforms';
	import Hint from '$dtss/Hint.svelte';
	import Notice from '$dtss/Notice.svelte';
	import Page from '$dtss/Page.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';
	import { openStripeSetupInNewTab } from '$lib/_helpers/openStripeSetup';
	import SupportTicketDialog from '$lib/components/dialogs/supportTicketDialog.svelte';
	import AddRequisitionDrawer from '$lib/components/drawers/addRequisitionDrawer.svelte';
	import { Button } from '$lib/components/ui/button';
	import type { ClientRequisitionSchema } from '$lib/config/zod-schemas';
	import { ACTION_HINTS } from '../hints';
	import { showLocationColumn } from '../scope';
	import type { AttentionGroup, CoverageShift, DashboardScope, Metric } from '../types';
	import { BUSINESS_TIMEZONE } from '../window';
	import AtAGlance from './AtAGlance.svelte';
	import AttentionQueue from './AttentionQueue.svelte';
	import { keepFresh } from './live';
	import NextShiftCard from './NextShiftCard.svelte';
	import NoLocationsState from './NoLocationsState.svelte';
	import ScopeChip from './ScopeChip.svelte';
	import SectionSkeleton from './SectionSkeleton.svelte';
	import UpcomingShiftsList from './UpcomingShiftsList.svelte';

	type MaybePromise<T> = T | Promise<T>;
	type Glance = {
		openRequests: Metric<number>;
		shiftsThisMonth: Metric<{ filled: number; total: number }>;
		balance: Metric<{ due: number; overdue: number }> | null;
	};

	export type ClientDashboardData = {
		scope: DashboardScope;
		isOwner: boolean;
		clientStatus: string;
		canCreateRequisitions: boolean;
		notice: { kind: 'account'; status: string } | { kind: 'billing' } | null;
		clientForm: SuperValidated<ClientRequisitionSchema> | null;
		noLocations: boolean;
		attention: AttentionGroup[];
		upcoming: MaybePromise<Metric<CoverageShift[]>> | null;
		glance: MaybePromise<Glance> | null;
	};

	let {
		data,
		user,
		now = new Date(),
		live = true
	}: {
		data: ClientDashboardData;
		user: { firstName?: string | null } & Record<string, unknown>;
		now?: Date;
		live?: boolean;
	} = $props();

	let drawerExpanded = $state(false);
	let billingSubmitting = $state(false);
	let billingError = $state('');
	let billingHelpOpen = $state(false);

	const scope = $derived(data.scope);
	const canPost = $derived(data.canCreateRequisitions && scope.can.postRequests && !!data.clientForm);
	const postBlockedReason = $derived(
		!data.canCreateRequisitions ? ACTION_HINTS.postDisabled : !scope.can.postRequests ? ACTION_HINTS.postDisabledStaff : null
	);
	const showLocation = $derived(showLocationColumn(scope));

	function hrefFor(locationId: string | null) {
		const url = new URL(page.url);
		if (locationId) url.searchParams.set('location', locationId);
		else url.searchParams.delete('location');
		return `${url.pathname}${url.search}`;
	}

	async function startBillingSetup() {
		billingError = '';
		billingSubmitting = true;
		await openStripeSetupInNewTab({
			onReturn: () => invalidateAll(),
			onError: (msg) => (billingError = msg)
		});
		billingSubmitting = false;
	}

	onMount(() => (live ? keepFresh() : undefined));

	const today = $derived(formatInTimeZone(now, BUSINESS_TIMEZONE, 'EEEE, MMM d'));
	const nextShift = (shifts: Metric<CoverageShift[]>) =>
		shifts.ok
			? (shifts.value.find((s) => s.status === 'FILLED' && s.professionalName && new Date(s.dayStart) > now) ?? null)
			: null;
</script>

{#snippet postButton()}
	{#if canPost}
		<Button on:click={() => (drawerExpanded = true)}><Plus class="mr-1.5 size-4" aria-hidden="true" />Post a request</Button>
	{:else if postBlockedReason}
		<Hint text={postBlockedReason}>
			<span class="inline-flex h-10 cursor-not-allowed items-center rounded-md bg-primary-strong px-4 text-sm font-medium text-primary-foreground opacity-50">
				<Plus class="mr-1.5 size-4" aria-hidden="true" />Post a request
			</span>
		</Hint>
	{/if}
{/snippet}

<Page>
	<PageHeader title="Welcome back{user?.firstName ? `, ${user.firstName}` : ''}" description={today}>
		{#snippet actions()}
			<ScopeChip {scope} {hrefFor} />
			{@render postButton()}
		{/snippet}
	</PageHeader>

	{#if data.notice?.kind === 'account'}
		<Notice tone={data.notice.status === 'DENIED' ? 'negative' : 'pending'} title={data.notice.status === 'PENDING' ? 'Your account is pending approval' : data.notice.status === 'DENIED' ? 'Your account was not approved' : 'Your account is inactive'}>
			{#if data.notice.status === 'PENDING'}
				You'll be able to post requests once DTSS approves your account.
			{:else if data.notice.status === 'DENIED'}
				Contact support if you believe this is a mistake.
			{:else}
				Posting requests is paused. Contact support to reactivate.
			{/if}
		</Notice>
	{:else if data.notice?.kind === 'billing'}
		<Notice tone="pending" title="Finish setting up billing">
			<p>Save a payment method so we can charge for services once you start hiring. You won't be charged anything today.</p>
			<div class="mt-3 flex flex-wrap gap-2">
				<Button size="sm" disabled={billingSubmitting} on:click={startBillingSetup}>
					{billingSubmitting ? 'Opening Stripe…' : 'Set up billing'}
				</Button>
				<Button size="sm" variant="outline" on:click={() => (billingHelpOpen = true)}>Need help?</Button>
			</div>
			{#if billingError}<p class="mt-2 font-semibold text-status-negative-fg" role="alert">{billingError}</p>{/if}
		</Notice>
	{/if}

	{#if data.noLocations}
		<NoLocationsState ownerName={scope.ownerName} ownerEmail={scope.ownerEmail} />
	{:else}
		<AttentionQueue
			groups={data.attention}
			title="Waiting on you"
			emptyTitle="Nothing is waiting on you"
			emptyDescription="Timesheets to approve, applicants and invoices show up here."
			{showLocation}
			{now}
			syncUrl={live}
		/>

		<div class="grid gap-6 lg:grid-cols-3">
			<div class="lg:col-span-2">
				{#await data.upcoming}
					<SectionSkeleton label="upcoming shifts" rows={4} />
				{:then upcoming}
					{#if upcoming}
						<UpcomingShiftsList shifts={upcoming} {showLocation} {now}>
							{#snippet empty()}{@render postButton()}{/snippet}
						</UpcomingShiftsList>
					{/if}
				{/await}
			</div>
			<div class="space-y-6">
				{#await data.upcoming then upcoming}
					{#if upcoming}
						<NextShiftCard shift={nextShift(upcoming)} {showLocation} {now}>
							{#snippet cta()}{@render postButton()}{/snippet}
						</NextShiftCard>
					{/if}
				{/await}
				{#await data.glance}
					<SectionSkeleton label="at a glance" rows={3} />
				{:then glance}
					{#if glance}<AtAGlance {glance} />{/if}
				{/await}
			</div>
		</div>
	{/if}
</Page>

{#if data.clientForm && canPost}
	<AddRequisitionDrawer {user} bind:drawerExpanded clientForm={data.clientForm} />
{/if}
{#if data.notice?.kind === 'billing'}
	<SupportTicketDialog
		bind:open={billingHelpOpen}
		title="Get help setting up billing"
		description="Tell us anything that would help — preferred contact times, payment method preference, etc. An admin will reach out."
		defaultTitle="Billing setup help needed"
		defaultBody="I'd like an admin to help me set up billing for my account."
		submitLabel="Request admin help"
	/>
{/if}
