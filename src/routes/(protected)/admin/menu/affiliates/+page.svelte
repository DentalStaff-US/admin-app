<script lang="ts">
	import { Download } from 'lucide-svelte';
	import Notice from '$dtss/Notice.svelte';
	import Page from '$dtss/Page.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';
	import Section from '$dtss/Section.svelte';
	import { Button } from '$lib/components/ui/button';
	import {
		AffiliatePayoutsTable,
		AffiliateProgramSettingsForm,
		AffiliatesTable,
		AffiliateTotals,
		FlaggedReferralsTable
	} from '$features/admin';

	let { data } = $props();

	const flagged = $derived(data.referrals.filter((r) => r.status === 'PENDING'));
	const failedPayouts = $derived(data.payouts.filter((p) => p.status === 'FAILED').length);
</script>

<Page>
	<PageHeader
		title="Affiliate program"
		description="Commission is {data.config.commissionRate}% of regular hours on paid temp-shift invoices. Overtime is excluded. Payouts settle on the 1st of the month after next."
	>
		{#snippet actions()}
			<!-- Exports live with the rest of the financial downloads. -->
			{#if data.isSuperadmin}
				<Button variant="outline" href="/admin/menu/exports"><Download class="mr-2 size-4" aria-hidden="true" /> Ledger and payout CSVs</Button>
			{/if}
		{/snippet}
	</PageHeader>

	{#if !data.config.programEnabled}
		<Notice tone="pending" title="The program is off">
			The portal is dark and the affiliate API returns 503, but referral link capture is still
			running, so attribution keeps accumulating.
		</Notice>
	{/if}

	<AffiliateTotals totals={data.totals} {failedPayouts} />

	<AffiliateProgramSettingsForm form={data.settingsForm} canEdit={data.isSuperadmin} />

	{#if flagged.length}
		<section class="space-y-3">
			<div>
				<h2 class="text-h2">Flagged for review ({flagged.length})</h2>
				<p class="mt-1 text-sm text-muted-foreground">
					Caught by a fraud heuristic. Automated checks only hard-reject on identity equality;
					anything statistical comes here for a person to decide.
				</p>
			</div>
			<FlaggedReferralsTable referrals={flagged} canResolve={data.isSuperadmin} />
		</section>
	{/if}

	<section class="space-y-3">
		<h2 class="text-h2">Affiliates</h2>
		<AffiliatesTable affiliates={data.affiliates} filters={data.filters} programRate={data.config.commissionRate} />
	</section>

	<section class="space-y-3">
		<h2 class="text-h2">Payout history</h2>
		<AffiliatePayoutsTable payouts={data.payouts} />
	</section>
</Page>
