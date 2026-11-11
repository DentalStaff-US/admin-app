<script lang="ts">
	// Dashboard design review on fixtures (dev only, gated by /_dev/+layout.server.ts).
	// ?audience=admin|owner|manager|employee|nolocations  ?state=normal|empty|failed|loading
	import { page } from '$app/state';
	import AdminShell from '$shell/AdminShell.svelte';
	import { AdminDashboardPage, ClientDashboardPage } from '$features/dashboard';
	import { failed, ok } from '$lib/features/dashboard/types';
	import * as fx from './fixtures';

	const audience = $derived(page.url.searchParams.get('audience') ?? 'admin');
	const view = $derived(page.url.searchParams.get('state') ?? 'normal');
	let sidebar = $state<'expanded' | 'rail'>('expanded');

	const never = new Promise<never>(() => {});

	const adminData = $derived({
		attention: view === 'empty' ? fx.emptyGroups() : view === 'failed' ? fx.failedGroups() : fx.adminGroups(),
		summary: view === 'empty' ? null : '3 shifts in the next 48h are still open · 1 booked professional has an expired credential · 3 timesheets waiting on you',
		compliance: view === 'failed' ? failed() : view === 'empty' ? ok({ counts: { CRITICAL: 0, BLOCKED: 0, ACTION: 0, WATCH: 0 }, snoozed: 2, items: [] }) : fx.compliance,
		window: 'month' as const,
		coverageDays: fx.coverageDays,
		coverage: view === 'loading' ? never : view === 'failed' ? failed() : ok(view === 'empty' ? [] : fx.coverageShifts()),
		kpis: view === 'loading' ? never : view === 'failed' ? fx.failedKpis() : fx.kpis(),
		pipeline: view === 'loading' ? never : view === 'failed' ? failed() : fx.pipeline,
		receivables: view === 'loading' ? never : fx.receivables,
		permPipeline: view === 'loading' ? never : fx.permPipeline,
		trends: view === 'loading' ? never : view === 'failed' ? failed() : fx.trends,
		agreements: view === 'loading' ? never : view === 'failed' ? failed() : fx.agreements,
		adminForm: null,
		newProfessionalForm: null,
		newClientForm: null
	});

	const scope = $derived(fx.scopeFor(audience));
	const practiceData = $derived({
		scope,
		isOwner: audience === 'owner',
		clientStatus: view === 'pending' ? 'PENDING' : 'ACTIVE',
		canCreateRequisitions: view !== 'pending',
		notice: view === 'pending' ? { kind: 'account' as const, status: 'PENDING' } : view === 'billing' ? { kind: 'billing' as const } : null,
		clientForm: null,
		noLocations: audience === 'nolocations',
		attention: view === 'empty' ? [] : fx.practiceGroups(scope),
		upcoming: view === 'loading' ? never : view === 'failed' ? failed() : ok(view === 'empty' ? [] : fx.practiceShifts(scope)),
		glance: view === 'loading' ? never : view === 'failed' ? { openRequests: failed(), shiftsThisMonth: failed(), balance: scope.can.viewBilling ? failed() : null } : fx.glance(scope)
	});

	const role = $derived(audience === 'admin' ? 'SUPERADMIN' : audience === 'owner' ? 'CLIENT' : 'CLIENT_STAFF');
</script>

<AdminShell pathname="/dashboard" nav={{ role, isOfficeAdmin: audience === 'owner' }} bind:sidebar name={audience === 'admin' ? 'Shannon Carter' : 'Dana Ruiz'} initials={audience === 'admin' ? 'SC' : 'DR'}>
	{#if audience === 'admin'}
		{#key view}<AdminDashboardPage data={adminData} user={{ firstName: 'Shannon' }} now={fx.NOW} live={false} />{/key}
	{:else}
		{#key audience + view}
			<ClientDashboardPage
				data={practiceData}
				user={{ firstName: audience === 'owner' ? 'Dana' : audience === 'manager' ? 'Chris' : 'Riley' }}
				now={fx.NOW}
				live={false}
			/>
		{/key}
	{/if}
</AdminShell>
