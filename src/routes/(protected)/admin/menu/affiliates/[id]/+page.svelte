<script lang="ts">
	import { ArrowLeft } from 'lucide-svelte';
	import FactGrid from '$dtss/FactGrid.svelte';
	import Notice from '$dtss/Notice.svelte';
	import Page from '$dtss/Page.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';
	import StatusBadge from '$dtss/StatusBadge.svelte';
	import { Button } from '$lib/components/ui/button';
	import {
		AffiliateControls,
		AffiliateLedgerTable,
		AffiliatePayoutsTable,
		AffiliateReferralsTable,
		FlaggedReferralsTable,
		money,
		payoutReadiness,
		shortDate
	} from '$features/admin';

	let { data, form } = $props();

	const p = $derived(data.profile);
	const name = $derived(p.name ?? p.email);
	const flagged = $derived(data.referrals.filter((r) => r.status === 'PENDING'));
	const unpaid = $derived(Number(data.totals.unpaidApproved));
	const readiness = $derived(payoutReadiness(p));
</script>

<svelte:head><title>Affiliate #{p.pid} · {name} | DTSS</title></svelte:head>

<Page>
	<div>
		<Button variant="link" href="/admin/menu/affiliates" class="h-auto px-0"><ArrowLeft class="mr-1 size-4" aria-hidden="true" /> All affiliates</Button>
	</div>
	<PageHeader
		title={name}
		description="Affiliate #{p.pid} · {data.affiliateType} · {p.email}{p.organizationName ? ` · ${p.organizationName}` : ''} · joined {shortDate(p.createdAt)}"
	>
		{#snippet actions()}
			<StatusBadge status={p.status} hint={p.statusReason ? `Reason: ${p.statusReason}` : undefined} />
			{#if p.statusSetManually}<span class="self-center text-caption text-muted-foreground">Set manually</span>{/if}
		{/snippet}
	</PageHeader>

	{#if form?.message}
		<Notice tone="negative" alert>{form.message}</Notice>
	{/if}

	<FactGrid
		columns={4}
		facts={[
			{ label: 'Referral code', value: p.code ?? '—' },
			{ label: 'Pending', value: money(data.totals.pending) },
			{ label: unpaid < 0 ? 'Owed back to DTSS' : 'Awaiting payout', value: money(Math.abs(unpaid)) },
			{ label: 'Paid out', value: money(data.totals.paid) },
			{ label: 'Reversed', value: money(data.totals.reversed) },
			{ label: 'Effective rate', value: `${data.effectiveRate.ratePercent}%` },
			{ label: 'Status reason', value: p.statusReason ?? '—' },
			{ label: 'Payouts', value: readiness.label }
		]}
	/>

	{#if unpaid < 0}
		<Notice tone="warning" title="This affiliate owes DTSS {money(Math.abs(unpaid))}">
			Clawbacks exceed unpaid earnings. It nets against future commission before anything is transferred.
		</Notice>
	{/if}

	<p class="text-sm">
		<span class="font-semibold">Stripe Connect:</span>
		<StatusBadge status={readiness.status} label={readiness.label} />
		{#if p.stripeConnectAccountId}<code class="ml-1 text-xs text-muted-foreground">{p.stripeConnectAccountId}</code>{/if}
		{#if !p.connectPayoutsEnabled && p.connectRequirementsDue?.length}
			<span class="text-muted-foreground"> · Stripe still needs: {p.connectRequirementsDue.join(', ')}</span>
		{:else if !p.stripeConnectAccountId}
			<span class="text-muted-foreground"> · The balance accrues and pays once they connect.</span>
		{/if}
	</p>

	{#if data.isSuperadmin}
		<AffiliateControls
			{name}
			status={p.status}
			commissionRateOverride={p.commissionRateOverride}
			overrideReason={p.overrideReason}
			effectiveRate={data.effectiveRate}
			programRate={data.programRate}
		/>
	{/if}

	{#if flagged.length}
		<section class="space-y-3">
			<h2 class="text-h2">Flagged for review ({flagged.length})</h2>
			<FlaggedReferralsTable referrals={flagged} canResolve={data.isSuperadmin} showAffiliate={false} />
		</section>
	{/if}

	<section class="space-y-3">
		<h2 class="text-h2">Referrals ({data.referrals.length})</h2>
		<AffiliateReferralsTable referrals={data.referrals} />
	</section>

	<section class="space-y-3">
		<div>
			<h2 class="text-h2">Ledger</h2>
			<p class="mt-1 text-sm text-muted-foreground">Append-only. Adjustments and reversals appear as their own rows.</p>
		</div>
		<AffiliateLedgerTable ledger={data.ledger} />
	</section>

	<section class="space-y-3">
		<h2 class="text-h2">Payouts</h2>
		<AffiliatePayoutsTable payouts={data.payouts} perAffiliate />
	</section>
</Page>
