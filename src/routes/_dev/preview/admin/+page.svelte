<script lang="ts">
	// Dev-only fixtures for the admin menu index and the compliance page.
	// ?view=menu (default) | compliance | compliance-clear | compliance-error
	import { page } from '$app/state';
	import AdminShell from '$shell/AdminShell.svelte';
	import Page from '$dtss/Page.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';
	import { ADMIN_MENU_ITEMS, AdminMenuGrid, ComplianceQueue, type ComplianceRow } from '$features/admin';
	import type { ComplianceSeverity } from '$lib/config/compliance';

	const view = $derived(page.url.searchParams.get('view') ?? 'menu');
	let sidebar = $state<'expanded' | 'rail'>('expanded');

	const hoursAgo = (h: number) => new Date(Date.now() - h * 3600000).toISOString();
	const items: ComplianceRow[] = [
		{ subjectId: 'c1', subjectName: 'Maria Lopez', ruleKey: 'LICENSE:rdh', severity: 'CRITICAL', title: 'Dental hygiene license', detail: 'Expired Nov 2', dueOn: '2026-11-02', upcomingShifts: [{ requisitionId: 1042, recurrenceDayId: 'd1', date: 'Nov 12' }, { requisitionId: 1042, recurrenceDayId: 'd2', date: 'Nov 13' }], snoozedUntil: null, remindable: true, remindedAt: hoursAgo(3) },
		{ subjectId: 'c2', subjectName: 'James Whitfield', ruleKey: 'CERT:cpr', severity: 'BLOCKED', title: 'CPR certification', detail: 'Expired Oct 28', dueOn: '2026-10-28', upcomingShifts: [], snoozedUntil: null, remindable: true, remindedAt: null },
		{ subjectId: 'c3', subjectName: 'Priya Natarajan', ruleKey: 'LICENSE:da', severity: 'ACTION', title: 'Dental assistant license', detail: 'No license on file — 9 days of grace left', dueOn: '2026-11-19', upcomingShifts: [{ requisitionId: 1051, recurrenceDayId: 'd3', date: 'Nov 15' }], snoozedUntil: null, remindable: true, remindedAt: null },
		{ subjectId: 'c4', subjectName: 'Ashley Brennan', ruleKey: 'CERT:xray', severity: 'WATCH', title: 'Radiology certification', detail: 'Expires Dec 1', dueOn: '2026-12-01', upcomingShifts: [], snoozedUntil: null, remindable: false }
	];
	const counts: Record<ComplianceSeverity, number> = { CRITICAL: 1, BLOCKED: 1, ACTION: 1, WATCH: 1 };
	const href = (s: ComplianceSeverity | null, snoozed: boolean) => `?view=compliance${s ? `&severity=${s}` : ''}${snoozed ? '&snoozed=1' : ''}`;
</script>

<AdminShell pathname={view === 'menu' ? '/admin/menu' : '/admin/compliance'} nav={{ role: 'SUPERADMIN' }} bind:sidebar name="Shannon Carter" initials="SC">
	{#if view === 'menu'}
		<Page>
			<PageHeader title="Admin" description="Tools for running the platform: people, billing, communication, data and system settings." />
			<AdminMenuGrid items={ADMIN_MENU_ITEMS} />
		</Page>
	{:else}
		<Page>
			<PageHeader title="Compliance" description="Professionals whose license or certification needs attention. Clients will appear here once agreement tracking exists." />
			<ComplianceQueue
				items={view === 'compliance' ? items : []}
				counts={view === 'compliance' ? counts : { CRITICAL: 0, BLOCKED: 0, ACTION: 0, WATCH: 0 }}
				snoozedCount={2}
				severity={null}
				showSnoozed={false}
				loadError={view === 'compliance-error' ? 'Could not load compliance data.' : null}
				{href}
			/>
		</Page>
	{/if}
</AdminShell>
