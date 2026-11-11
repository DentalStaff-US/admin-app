<script lang="ts">
	import { page } from '$app/stores';
	import { replaceState } from '$app/navigation';
	import { AlertCircle } from 'lucide-svelte';
	import { formatInTimeZone } from 'date-fns-tz';
	import EmptyState from '$dtss/EmptyState.svelte';
	import FactGrid, { type Fact } from '$dtss/FactGrid.svelte';
	import Notice from '$dtss/Notice.svelte';
	import Page from '$dtss/Page.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';
	import Section from '$dtss/Section.svelte';
	import StatusBadge from '$dtss/StatusBadge.svelte';
	import ActivityLog from '$lib/components/audit/ActivityLog.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Tabs from '$lib/components/ui/tabs';
	import { USER_ROLES } from '$lib/config/constants';
	import { cn } from '$lib/utils';
	import { EMPTY_COUNTS } from '../permanentLifecycle';
	import CreateInvoiceSheet from './CreateInvoiceSheet.svelte';
	import PermanentLifecycleStepper from './PermanentLifecycleStepper.svelte';
	import RecurrenceDaysSheet from './RecurrenceDaysSheet.svelte';
	import RequestActionsMenu from './RequestActionsMenu.svelte';
	import RequestApplicantsSection from './RequestApplicantsSection.svelte';
	import RequestBillingSection from './RequestBillingSection.svelte';
	import RequestCommentsSection from './RequestCommentsSection.svelte';
	import RequestDetailsSection from './RequestDetailsSection.svelte';
	import RequestMatchesSection from './RequestMatchesSection.svelte';
	import RequestScheduleSection from './RequestScheduleSection.svelte';
	import RequestTimesheetsSection from './RequestTimesheetsSection.svelte';
	import RequisitionTypePill from './RequisitionTypePill.svelte';

	// The route's page data, passed through whole: this component is the page body.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let { data }: { data: any } = $props();

	const user = $derived(data.user);
	const isAdmin = $derived(user?.role === USER_ROLES.SUPERADMIN);
	const audience = $derived(isAdmin ? ('admin' as const) : ('practice' as const));
	const noun = 'requisition';
	const req = $derived(data.requisition);
	const company = $derived(data.company);
	const permanent = $derived(!!req?.permanentPosition);
	const canManage = $derived(!!data.hasRequisitionRights);
	const billing = $derived(data.billing ?? null);
	const comments = $derived(data.comments ?? []);
	const lifecycle = $derived(data.lifecycle ?? null);

	// Tabs (06 › Request detail). Old deep links keep working: ?tab=workdays,
	// applications, invoices/billing, activity, comments (from the comment email).
	type TabKey = 'schedule' | 'timesheets' | 'applicants' | 'matches' | 'details' | 'comments' | 'billing' | 'history';
	const ALIASES: Record<string, TabKey> = {
		workdays: 'schedule',
		applications: 'applicants',
		invoices: 'billing',
		activity: 'history'
	};
	const tabs = $derived.by(() => {
		const list: { value: TabKey; label: string; count?: number }[] = [];
		if (permanent) {
			list.push({ value: 'applicants', label: 'Applicants', count: (data.applications ?? []).filter((a: { application: { archived?: boolean } }) => !a.application.archived).length });
			if (isAdmin) list.push({ value: 'matches', label: 'Matches', count: (data.potentialMatches ?? []).length });
		} else {
			list.push({ value: 'schedule', label: 'Schedule', count: (data.recurrenceDays ?? []).length });
			list.push({ value: 'timesheets', label: 'Timesheets', count: (data.timesheets ?? []).length });
		}
		list.push({ value: 'details', label: 'Details' });
		if (permanent) list.push({ value: 'comments', label: 'Comments', count: comments.length });
		if (billing && (isAdmin || permanent)) list.push({ value: 'billing', label: permanent ? 'Billing' : 'Invoices', count: billing.invoices.length });
		if (isAdmin) list.push({ value: 'history', label: 'History' });
		return list;
	});
	const fromUrl = (url: URL): TabKey => {
		const raw = url.searchParams.get('tab') ?? '';
		const wanted = (ALIASES[raw] ?? raw) as TabKey;
		return tabs.some((t) => t.value === wanted) ? wanted : tabs[0].value;
	};
	let tab = $state<TabKey>('details');
	// Follow real navigations (a Stepper count link); tab clicks only rewrite the URL.
	$effect(() => {
		tab = fromUrl($page.url);
	});
	function selectTab(value: string | undefined) {
		if (!value) return;
		tab = value as TabKey;
		const url = new URL($page.url);
		url.searchParams.set('tab', value);
		url.searchParams.delete('stage');
		replaceState(url, $page.state);
	}

	const tz = $derived(req?.referenceTimezone ?? 'America/New_York');
	const datesFact = $derived.by(() => {
		if (!req) return '—';
		if (permanent) return `Posted ${formatInTimeZone(new Date(req.createdAt), tz, 'MMM d, yyyy')}`;
		const days = (data.recurrenceDays ?? []).filter((d: { status: string }) => d.status !== 'CANCELED');
		if (!days.length) return 'No days yet';
		const starts = days.map((d: { dayStart: string }) => new Date(d.dayStart).getTime()).sort((a: number, b: number) => a - b);
		const f = (t: number) => formatInTimeZone(new Date(t), tz, 'MMM d');
		const first = f(starts[0]);
		const last = f(starts[starts.length - 1]);
		return first === last ? first : `${first} – ${last} · ${days.length} day${days.length === 1 ? '' : 's'}`;
	});
	const facts = $derived<Fact[]>(
		req
			? [
					{ label: 'Rate', value: req.hourlyRate ? `$${req.hourlyRate}/hr` : '—' },
					{ label: 'Dates', value: datesFact },
					{ label: 'Location', cell: locationFact },
					{ label: 'Discipline', value: req.discipline?.name },
					{ label: 'Experience', value: req.experienceLevel?.value ?? 'No preference' },
					{ label: 'Timezone', value: tz.replace(/_/g, ' ') }
				]
			: []
	);

	let invoiceOpen = $state(false);
	const title = $derived(req ? req.title || req.discipline?.name || `Requisition #${req.id}` : '');
</script>

{#snippet locationFact()}
	{#if isAdmin}
		<a href={`/clients/${req.company.clientId}/locations/${req.location.id}`} class="text-primary-dark hover:underline">{req.location.name}</a>
	{:else}
		{req.location.name}
	{/if}
{/snippet}

{#snippet addDays()}
	<RecurrenceDaysSheet
		location={data.location}
		form={data.recurrenceDayForm}
		{company}
		requisition={req}
		{isAdmin}
		qualifiedProfessionals={data.qualifiedProfessionals ?? []}
		blockedReason={data.billingBlockedMessage}
	/>
{/snippet}

{#if !req}
	<Page width="narrow">
		<EmptyState icon={AlertCircle} title="Requisition not found" description="It may have been removed, or the link is wrong.">
			<Button href="/requisitions">Back to requisitions</Button>
		</EmptyState>
	</Page>
{:else}
	<Page>
		<PageHeader title={title} description={isAdmin ? `${company?.companyName ?? ''} · ${req.location?.name ?? ''}` : req.location?.name}>
			{#snippet actions()}
				{#if canManage}
					<RequestActionsMenu
						requisitionId={req.id}
						status={req.status}
						{permanent}
						{isAdmin}
						{noun}
						timezone={tz}
						onCreateInvoice={() => (invoiceOpen = true)}
					/>
				{/if}
			{/snippet}
		</PageHeader>

		<div class="-mt-3 flex flex-wrap items-center gap-2 text-sm">
			<RequisitionTypePill {permanent} />
			<StatusBadge status={req.status} />
			<span class="text-muted-foreground">#{req.id}</span>
			{#if isAdmin && company}
				<span aria-hidden="true" class="text-muted-foreground">·</span>
				<a href={`/clients/${req.company.clientId}`} class="font-semibold text-primary-dark hover:underline">{company.companyName}</a>
			{/if}
			{#if req.purchaseOrderNumber}
				<span aria-hidden="true" class="text-muted-foreground">·</span>
				<span class="text-muted-foreground">PO {req.purchaseOrderNumber}</span>
			{/if}
		</div>

		<!-- At most one page-level Notice (03 › Notice): a block beats a mismatch. -->
		{#if data.billingBlockedMessage}
			<Notice tone="warning" title="Billing setup required">
				{data.billingBlockedMessage}
				{#if isAdmin}
					<a href={`/clients/${req.company.clientId}`} class="ml-1 font-semibold underline">Open client page</a>
				{:else}
					<a href="/settings?tab=BILLING&role=CLIENT" class="ml-1 font-semibold underline">Go to billing settings</a>
				{/if}
			</Notice>
		{:else if data.billingMismatchMessage}
			<Notice tone="info" title="Billing as paper">
				{data.billingMismatchMessage}
				{#if isAdmin}
					<a href={`/clients/${req.company.clientId}`} class="ml-1 font-semibold underline">Open client page</a>
				{/if}
			</Notice>
		{/if}

		<FactGrid {facts} columns={3} />

		{#if permanent}
			<PermanentLifecycleStepper
				requisitionId={req.id}
				status={req.status}
				counts={lifecycle?.counts ?? EMPTY_COUNTS}
				fee={lifecycle?.fee ?? 'NONE'}
				{audience}
			/>
		{/if}

		<Tabs.Root value={tab} onValueChange={selectTab}>
			<div class="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
				<Tabs.List class="h-10 gap-1">
					{#each tabs as t (t.value)}
						<Tabs.Trigger value={t.value} class="h-8 gap-2 px-3 font-semibold data-[state=active]:shadow-card">
							{t.label}
							{#if t.count !== undefined}
								<span class={cn('rounded-full px-1.5 text-xs font-bold tabular-nums leading-5', tab === t.value ? 'bg-muted' : 'bg-background/70')}>
									{t.count}
								</span>
							{/if}
						</Tabs.Trigger>
					{/each}
				</Tabs.List>
			</div>

			<Tabs.Content value="schedule" class="mt-4">
				<RequestScheduleSection
					requisitionId={req.id}
					days={data.recurrenceDays ?? []}
					timezone={tz}
					{isAdmin}
					{canManage}
					{addDays}
				/>
			</Tabs.Content>
			<Tabs.Content value="timesheets" class="mt-4">
				<RequestTimesheetsSection timesheets={data.timesheets ?? []} />
			</Tabs.Content>
			<Tabs.Content value="applicants" class="mt-4">
				<RequestApplicantsSection
					requisitionId={req.id}
					requestStatus={req.status}
					applications={data.applications ?? []}
					interested={lifecycle?.interested ?? []}
					interestedCount={lifecycle?.counts.interested ?? 0}
					{audience}
					{canManage}
					stage={$page.url.searchParams.get('stage')}
				/>
			</Tabs.Content>
			{#if isAdmin && permanent}
				<Tabs.Content value="matches" class="mt-4">
					<RequestMatchesSection matches={data.potentialMatches ?? []} requisitionOpen={req.status === 'OPEN'} />
				</Tabs.Content>
			{/if}
			<Tabs.Content value="details" class="mt-4">
				<RequestDetailsSection
					requisition={req}
					skillRequirements={data.skillRequirements ?? []}
					disciplines={data.disciplines ?? []}
					experienceLevels={data.experienceLevels ?? []}
					canEdit={canManage}
				/>
			</Tabs.Content>
			{#if permanent}
				<Tabs.Content value="comments" class="mt-4">
					<RequestCommentsSection {comments} {isAdmin} currentUserId={user?.id ?? ''} companyName={company?.companyName ?? null} />
				</Tabs.Content>
			{/if}
			{#if billing}
				<Tabs.Content value="billing" class="mt-4">
					<RequestBillingSection
						{billing}
						{isAdmin}
						canOpenInvoicePage={user?.role === USER_ROLES.CLIENT}
						permanentPosition={permanent}
						requisitionStatus={req.status}
						onCreateInvoice={() => (invoiceOpen = true)}
					/>
				</Tabs.Content>
			{/if}
			{#if isAdmin}
				<Tabs.Content value="history" class="mt-4">
					<Section title="History" description="Every view and action on this requisition, its days and applications: who, when and from where.">
						<ActivityLog entries={data.activity ?? []} showEntity />
					</Section>
				</Tabs.Content>
			{/if}
		</Tabs.Root>
	</Page>

	{#if permanent && isAdmin}
		<CreateInvoiceSheet
			bind:open={invoiceOpen}
			invoiceForm={data.invoiceForm}
			requisitionId={req.id}
			label={req.discipline?.name ?? req.title ?? 'Permanent position'}
			clientInvoiceMethod={data.clientInvoiceMethod === 'PAPER' ? 'PAPER' : 'STRIPE'}
			billingMismatchMessage={data.billingMismatchMessage}
		/>
	{/if}
{/if}
