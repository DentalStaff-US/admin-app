<script lang="ts">
	// Dev-only fixtures for the admin communication + data screens.
	// ?view=list | detail | create | history | exports | templates
	import { page } from '$app/state';
	import { MailPlus } from 'lucide-svelte';
	import AdminShell from '$shell/AdminShell.svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import Page from '$dtss/Page.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';
	import { Button } from '$lib/components/ui/button';
	import type { ActivityEntry } from '$lib/audit/constants';
	import ActivityLog from '$lib/components/audit/ActivityLog.svelte';
	import {
		CampaignActions,
		CampaignDetail,
		CampaignTable,
		ExportList,
		MassNotificationForm,
		RecordHistoryTable,
		type CampaignRecipientRow,
		type CampaignRow
	} from '$features/admin';

	const view = $derived(page.url.searchParams.get('view') ?? 'list');
	let sidebar = $state<'expanded' | 'rail'>('expanded');

	const day = 864e5;
	const now = Date.now();
	const campaigns: CampaignRow[] = [
		{ id: 'c1', name: 'November RDH re-engagement', audience: 'CANDIDATE', channel: 'SMS', status: 'SENDING', subject: null, body: 'Hi {{firstName}}, Tampa practices posted 14 hygiene shifts for next week. Open the app to claim one.', recipientCount: 412, sentCount: 268, failedCount: 6, createdAt: new Date(now - 2 * 36e5) },
		{ id: 'c2', name: 'Holiday hours reminder', audience: 'CLIENT', channel: 'EMAIL', status: 'COMPLETED', subject: 'Posting shifts over the holidays', body: 'Hello {{firstName}},\n\nPost holiday coverage by Dec 1 so we can match you early.', recipientCount: 86, sentCount: 83, failedCount: 3, createdAt: new Date(now - 6 * day) },
		{ id: 'c3', name: 'Clawback notice — Q3', audience: 'CLIENT', channel: 'EMAIL', status: 'CANCELLED', subject: 'About your Q3 invoice', body: '…', recipientCount: 12, sentCount: 4, failedCount: 0, createdAt: new Date(now - 20 * day) },
		{ id: 'c4', name: 'Assistant licence renewal nudge', audience: 'CANDIDATE', channel: 'EMAIL', status: 'FAILED', subject: 'Your licence expires soon', body: '…', recipientCount: 30, sentCount: 0, failedCount: 30, createdAt: new Date(now - 40 * day) },
		{ id: 'c5', name: 'Draft: spring open house', audience: 'CANDIDATE', channel: 'SMS', status: 'DRAFT', subject: null, body: '…', recipientCount: 0, sentCount: 0, failedCount: 0, createdAt: new Date(now - 41 * day) }
	];
	const recipients: CampaignRecipientRow[] = [
		{ id: 'r1', firstName: 'Maria', lastName: 'Lopez', toAddress: '+1 813 555 0142', status: 'SENT', sentAt: new Date(now - 36e5), error: null },
		{ id: 'r2', firstName: 'Dana', lastName: 'Whitfield', toAddress: '+1 727 555 0199', status: 'FAILED', sentAt: null, error: 'Twilio 21614: not a mobile number' },
		{ id: 'r3', firstName: 'Priya', lastName: 'Shah', toAddress: '+1 813 555 0110', status: 'PENDING', sentAt: null, error: null },
		{ id: 'r4', firstName: null, lastName: null, toAddress: '+1 941 555 0177', status: 'SKIPPED', sentAt: null, error: null }
	];

	const entries: ActivityEntry[] = [
		{ id: 'a1', createdAt: new Date(now - 6e5), action: 'APPROVE', entityType: 'TIMESHEETS', entityId: '7c1f2e4a-91b0-4f6d-9e2a-3b5c8d7e6f10', userId: 'u1', actorName: 'Shannon Carter', actorEmail: 'shannon@dtstaffing.com', actorRole: 'SUPERADMIN', impersonatedBy: null, impersonatorName: null, source: 'ADMIN_APP', ipAddress: '73.12.44.9', userAgent: 'Mozilla/5.0 (Macintosh)', requestPath: '/timesheets/7c1f2e4a?/approve', metadata: { hours: 38.5 }, changes: { before: { status: 'SUBMITTED' }, after: { status: 'APPROVED' } } },
		{ id: 'a2', createdAt: new Date(now - 36e5), action: 'VIEW', entityType: 'CANDIDATE_PROFILES', entityId: 'cand-5512', userId: 'u2', actorName: 'Bright Smiles Tampa', actorEmail: 'office@brightsmiles.com', actorRole: 'CLIENT', impersonatedBy: null, impersonatorName: null, source: 'ADMIN_APP', ipAddress: '98.4.1.20', userAgent: null, requestPath: null, metadata: null, changes: null },
		{ id: 'a3', createdAt: new Date(now - 3 * 36e5), action: 'IMPERSONATE_START', entityType: 'USERS', entityId: 'u2', userId: 'u1', actorName: 'Shannon Carter', actorEmail: 'shannon@dtstaffing.com', actorRole: 'SUPERADMIN', impersonatedBy: null, impersonatorName: null, source: 'ADMIN_APP', ipAddress: '73.12.44.9', userAgent: null, requestPath: null, metadata: null, changes: null },
		{ id: 'a4', createdAt: new Date(now - day), action: 'VOID', entityType: 'INVOICES', entityId: 'in_1QbX92Lk', userId: 'u3', actorName: 'Maria Lopez', actorEmail: 'maria@example.com', actorRole: 'CANDIDATE', impersonatedBy: 'u1', impersonatorName: 'Shannon Carter', source: 'CANDIDATE_APP', ipAddress: null, userAgent: null, requestPath: null, metadata: { reason: 'Duplicate' }, changes: null }
	];
	const none = { search: '', startDate: '', endDate: '', entityType: '', action: '', role: '', source: '' };

	const formData = {
		form: {
			id: 'mass-notification',
			valid: false,
			posted: false,
			errors: {},
			constraints: {},
			data: {
				name: '', audience: 'CANDIDATE', channel: 'SMS', subject: '', body: '', applyRecipientSelection: false,
				selectedRecipientKeys: [], staleOnly: false, filterName: '', filterEmail: '', filterPhone: '', filterStatus: '',
				createdFrom: '', createdTo: '', disciplineId: '', experienceLevelId: ''
			}
		} as any,
		disciplines: [{ id: 'd1', name: 'Dental Hygienist' }, { id: 'd2', name: 'Dental Assistant' }, { id: 'd3', name: 'Front Office' }],
		experienceLevels: [{ id: 'e1', value: 'Entry' }, { id: 'e2', value: '1–3 years' }, { id: 'e3', value: '3+ years' }],
		candidateStatuses: ['PENDING', 'APPROVED', 'DENIED', 'INACTIVE'],
		clientStatuses: ['PENDING', 'ACTIVE', 'INACTIVE'],
		defaultRadiusMiles: 30,
		testDefaults: { email: 'shannon@dtstaffing.com' }
	};

	const groups = [
		{ group: 'Affiliate Program', items: [
			{ key: 'affiliate-ledger', label: 'Commission ledger', description: 'Every commission accrual and reversal, one row per referral event.', dateField: 'accrued date' },
			{ key: 'affiliate-payouts', label: 'Payouts', description: 'Payout batches with partner, method and amount.', dateField: 'paid date' }
		] }
	];
</script>

<AdminShell pathname="/admin/menu" nav={{ role: 'SUPERADMIN' }} bind:sidebar name="Shannon Carter" initials="SC">
	{#if view === 'list'}
		<Page>
			<PageHeader title="Mass notifications" description="Targeted SMS and email campaigns to professionals and practices.">
				{#snippet actions()}<Button href="?view=create">New mass notification</Button>{/snippet}
			</PageHeader>
			<CampaignTable {campaigns} />
			<CampaignTable campaigns={[]} />
		</Page>
	{:else if view === 'detail'}
		<Page>
			<PageHeader title={campaigns[0].name} description="Mass notification">
				{#snippet actions()}<CampaignActions campaign={campaigns[0]} /><CampaignActions campaign={campaigns[1]} />{/snippet}
			</PageHeader>
			<CampaignDetail campaign={campaigns[0]} {recipients} />
		</Page>
	{:else if view === 'create'}
		<Page>
			<PageHeader title="New mass notification" description="Pick an audience and filters, preview who it reaches, then queue the send." />
			<MassNotificationForm data={formData} />
		</Page>
	{:else if view === 'history'}
		<Page width="full">
			<PageHeader title="Record history" description="The platform ledger: every view and action, who did it, when, and from where." />
			<RecordHistoryTable rows={entries} total={1234} page={2} pageSize={50} filters={{ ...none, action: 'VIEW' }} />
			<RecordHistoryTable rows={[]} total={0} page={1} pageSize={50} filters={none} />
			<ActivityLog {entries} />
		</Page>
	{:else if view === 'exports'}
		<Page width="narrow">
			<PageHeader title="Exports" description="CSV downloads for bookkeeping and reporting." />
			<ExportList {groups} />
		</Page>
	{:else}
		<Page>
			<PageHeader title="Notification templates" description="Reusable SMS and email copy for mass notifications." />
			<EmptyState icon={MailPlus} title="Coming soon" description="Saved templates aren't available yet. Write the message directly when you create a mass notification.">
				<Button href="?view=create">New mass notification</Button>
			</EmptyState>
		</Page>
	{/if}
</AdminShell>
