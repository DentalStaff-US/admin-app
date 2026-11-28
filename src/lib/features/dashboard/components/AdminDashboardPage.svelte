<script lang="ts">
	// DTSS admins (10 §3): Needs attention → what's coming (coverage) → KPIs on one
	// window → pipeline, receivables, compliance, permanent pipeline.
	import { onMount } from 'svelte';
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { formatInTimeZone } from 'date-fns-tz';
	import type { SuperValidated } from 'sveltekit-superforms';
	import Page from '$dtss/Page.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';
	import AddRequisitionDrawer from '$lib/components/drawers/addRequisitionDrawer.svelte';
	import type { AdminNewUserSchema, AdminRequisitionSchema } from '$lib/config/zod-schemas';
	import type { ComplianceSectionData } from '../compliance';
	import type {
		AdminKpis,
		AttentionGroup,
		CoverageShift,
		KpiWindow,
		Metric,
		PermPipeline,
		Receivables,
		ShiftPipeline
	} from '../types';
	import type { AgreementStatus } from '../agreements';
	import type { TimesheetStageCount } from '../timesheetStages';
	import type { AdminTrends } from '../trends';
	import { BUSINESS_TIMEZONE } from '../window';
	import AddUserDialog from './AddUserDialog.svelte';
	import AgreementsPanel from './AgreementsPanel.svelte';
	import AttentionSummary from './AttentionSummary.svelte';
	import ComplianceSection from './ComplianceSection.svelte';
	import CoverageBoard from './CoverageBoard.svelte';
	import FailedLine from './FailedLine.svelte';
	import FillRateChart from './FillRateChart.svelte';
	import KpiBand from './KpiBand.svelte';
	import { keepFresh } from './live';
	import MoneyTrendChart from './MoneyTrendChart.svelte';
	import NewRequestMenu from './NewRequestMenu.svelte';
	import PermPipelinePanel from './PermPipelinePanel.svelte';
	import PipelineBar from './PipelineBar.svelte';
	import ReceivablesAgeing from './ReceivablesAgeing.svelte';
	import SectionSkeleton from './SectionSkeleton.svelte';
	import ShiftStatusChart from './ShiftStatusChart.svelte';
	import TimesheetStagesCard from './TimesheetStagesCard.svelte';
	import TopPracticesList from './TopPracticesList.svelte';
	import WindowSelect from './WindowSelect.svelte';

	type MaybePromise<T> = T | Promise<T>;

	export type AdminDashboardData = {
		attention: AttentionGroup[];
		summary: string | null;
		compliance: Metric<ComplianceSectionData>;
		window: KpiWindow;
		coverageDays: string[];
		coverage: MaybePromise<Metric<CoverageShift[]>>;
		kpis: MaybePromise<AdminKpis>;
		pipeline: MaybePromise<Metric<ShiftPipeline>>;
		receivables: MaybePromise<Metric<Receivables>>;
		permPipeline: MaybePromise<Metric<PermPipeline>>;
		trends: MaybePromise<Metric<AdminTrends>>;
		agreements: MaybePromise<Metric<AgreementStatus>>;
		timesheets: MaybePromise<Metric<TimesheetStageCount[]>>;
		adminForm: SuperValidated<AdminRequisitionSchema> | null;
		newProfessionalForm: SuperValidated<AdminNewUserSchema> | null;
		newClientForm: SuperValidated<AdminNewUserSchema> | null;
	};

	let {
		data,
		user,
		now = new Date(),
		live = true
	}: {
		data: AdminDashboardData;
		user: { firstName?: string | null } & Record<string, unknown>;
		now?: Date;
		/** Off in fixtures: no refresh, no KPI fetches, no URL writes. */
		live?: boolean;
	} = $props();

	let drawerExpanded = $state(false);
	let addProfessional = $state(false);
	let addClient = $state(false);

	// --- The KPI window: changing it fetches the band and pipeline only (10 §3.4).
	// svelte-ignore state_referenced_locally
	let selected = $state<KpiWindow>(data.window);
	let fetched = $state<{ window: KpiWindow; kpis: AdminKpis; pipeline: Metric<ShiftPipeline> } | null>(null);
	let fetching = $state(false);
	let fetchFailed = $state(false);

	const kpis = $derived(fetched && fetched.window === selected ? fetched.kpis : data.kpis);
	const pipeline = $derived(fetched && fetched.window === selected ? fetched.pipeline : data.pipeline);

	async function chooseWindow(w: KpiWindow) {
		selected = w;
		fetchFailed = false;
		if (!live) return;
		const url = new URL(page.url);
		if (w === 'month') url.searchParams.delete('window');
		else url.searchParams.set('window', w);
		replaceState(url, page.state);
		if (w === data.window) {
			fetched = null;
			return;
		}
		fetching = true;
		try {
			const res = await fetch(`/dashboard/kpis?window=${w}`);
			if (!res.ok) throw new Error(String(res.status));
			const body = await res.json();
			if (selected === w) fetched = { window: w, ...body };
		} catch {
			fetchFailed = true;
		} finally {
			fetching = false;
		}
	}

	onMount(() => (live ? keepFresh() : undefined));

	const hour = $derived(Number(formatInTimeZone(now, BUSINESS_TIMEZONE, 'H')));
	const greeting = $derived(hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening');
	const today = $derived(formatInTimeZone(now, BUSINESS_TIMEZONE, 'EEE, MMM d'));
</script>

<Page>
	<PageHeader
		title="{greeting}{user?.firstName ? `, ${user.firstName}` : ''}"
		description={[today, data.summary ?? 'Nothing urgent right now'].join(' · ')}
	>
		{#snippet actions()}
			<NewRequestMenu
				onrequest={() => (drawerExpanded = true)}
				onprofessional={() => (addProfessional = true)}
				onclient={() => (addClient = true)}
			/>
		{/snippet}
	</PageHeader>

	<!-- Numbers first (10 §3, reworked): KPIs, then the week ahead beside a compact
	     Needs attention, then the trends, money and people panels. -->
	<section aria-labelledby="kpi-title" class="space-y-4">
		<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<h2 id="kpi-title" class="text-h3">How we're doing</h2>
			<WindowSelect value={selected} onchange={chooseWindow} disabled={fetching} />
		</div>
		{#if fetchFailed}<FailedLine what="the numbers for that window" />{/if}
		<div class:opacity-60={fetching} class="transition-opacity">
			{#await kpis}
				<SectionSkeleton label="KPIs" tiles={4} />
			{:then k}
				<KpiBand kpis={k} />
			{/await}
		</div>
	</section>

	<div class="grid gap-6 lg:grid-cols-3">
		<div class="min-w-0 lg:col-span-2">
			{#await data.coverage}
				<SectionSkeleton label="coverage" rows={5} />
			{:then coverage}
				<CoverageBoard shifts={coverage} days={data.coverageDays} />
			{/await}
		</div>
		<AttentionSummary groups={data.attention} {now} />
	</div>

	{#await data.timesheets}
		<SectionSkeleton label="timesheets" rows={1} />
	{:then t}
		{#if t.ok}<TimesheetStagesCard stages={t.value} />{:else}<FailedLine what="timesheets by stage" />{/if}
	{/await}

	{#await data.trends}
		<div class="grid gap-6 lg:grid-cols-2">
			<SectionSkeleton label="fill rate" rows={4} />
			<SectionSkeleton label="billing" rows={4} />
		</div>
	{:then trends}
		{#if trends.ok}
			<div class="grid gap-6 lg:grid-cols-2">
				<FillRateChart points={trends.value.fillRate} />
				<MoneyTrendChart points={trends.value.money} />
			</div>
			<div class="grid gap-6 lg:grid-cols-3">
				<div class="min-w-0 lg:col-span-2"><ShiftStatusChart points={trends.value.shiftsByStatus} /></div>
				<TopPracticesList practices={trends.value.topPractices} />
			</div>
		{:else}
			<FailedLine what="the trend charts" />
		{/if}
	{/await}

	<div class="grid gap-6 lg:grid-cols-3">
		<div class="min-w-0 lg:col-span-2" class:opacity-60={fetching}>
			{#await pipeline}
				<SectionSkeleton label="shift pipeline" rows={2} />
			{:then p}
				<PipelineBar pipeline={p} window={selected} />
			{/await}
		</div>
		{#await data.receivables}
			<SectionSkeleton label="receivables" rows={4} />
		{:then r}
			<ReceivablesAgeing receivables={r} />
		{/await}
	</div>

	<div class="grid gap-6 lg:grid-cols-3">
		<div class="min-w-0 lg:col-span-2"><ComplianceSection data={data.compliance} {now} /></div>
		<div class="space-y-6">
			{#await data.agreements}
				<SectionSkeleton label="agreements" rows={4} />
			{:then a}
				{#if a.ok}<AgreementsPanel status={a.value} {now} />{:else}<FailedLine what="agreements" />{/if}
			{/await}
			{#await data.permPipeline}
				<SectionSkeleton label="permanent pipeline" rows={5} />
			{:then p}
				<PermPipelinePanel pipeline={p} />
			{/await}
		</div>
	</div>
</Page>

{#if data.adminForm}
	<AddRequisitionDrawer {user} bind:drawerExpanded adminForm={data.adminForm} />
{/if}
{#if data.newProfessionalForm}
	<AddUserDialog bind:open={addProfessional} kind="professional" form={data.newProfessionalForm} />
{/if}
{#if data.newClientForm}
	<AddUserDialog bind:open={addClient} kind="client" form={data.newClientForm} />
{/if}
