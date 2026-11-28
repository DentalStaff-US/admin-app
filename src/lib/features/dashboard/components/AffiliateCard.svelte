<script lang="ts">
	// The viewer's own affiliate activity. Detail, payouts and setup live in the
	// partner portal; /affiliate-portal signs them in on the way.
	import { Check, Copy, ExternalLink } from 'lucide-svelte';
	import Hint from '$dtss/Hint.svelte';
	import Section from '$dtss/Section.svelte';
	import StatusBadge from '$dtss/StatusBadge.svelte';
	import { Button } from '$lib/components/ui/button';
	import type { AffiliateOverview } from '$lib/server/affiliate/status';
	import { affiliateCardState } from '../affiliate';
	import { formatMoney } from '../format';

	let { overview }: { overview: AffiliateOverview } = $props();

	const card = $derived(affiliateCardState(overview));
	const activity = $derived(overview.activity);
	let copied = $state(false);

	const stats = $derived(
		activity
			? [
					{ label: 'Active referrals', value: String(activity.referralsActive), hint: 'Practices and professionals you referred who count toward your commission.', detail: activity.referralsPending ? `${activity.referralsPending} under review` : null },
					{ label: 'Link clicks', value: String(activity.clicks), hint: 'Visits through your referral link.', detail: null },
					{ label: 'Earned, not paid yet', value: formatMoney(activity.earningsUnpaid), hint: 'Commission waiting for a future payout.', detail: null },
					{ label: 'Paid to you', value: formatMoney(activity.earningsPaid), hint: 'Commission already paid out.', detail: null }
				]
			: []
	);

	async function copy() {
		if (!overview.referralUrl) return;
		try {
			await navigator.clipboard.writeText(overview.referralUrl);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			copied = false;
		}
	}
</script>

{#snippet portal(label: string, variant: 'default' | 'outline')}
	<Button href="/affiliate-portal" target="_blank" rel="noopener" {variant} size="sm" class="gap-2" data-sveltekit-preload-data="off">
		{label}<ExternalLink class="size-3.5" aria-hidden="true" />
	</Button>
{/snippet}

{#if card.kind !== 'hidden'}
	<Section title="Affiliate program">
		{#snippet actions()}
			{#if card.kind === 'active' || card.kind === 'paused'}<StatusBadge status={card.badge.status} label={card.badge.label} />{/if}
		{/snippet}

		{#if card.kind === 'join'}
			<p class="text-sm text-muted-foreground">
				Refer practices and professionals to DTSS{overview.ratePercent ? ` and earn ${Number(overview.ratePercent)}% of the regular hours on their paid temp shifts` : ' and earn commission on their temp shifts'}.
			</p>
			<div class="mt-4">{@render portal('Join the program', 'default')}</div>
		{:else}
			{#if card.kind === 'paused'}<p class="mb-4 text-sm text-muted-foreground">{card.message}</p>{/if}
			{#if stats.length}
				<dl class="grid grid-cols-2 gap-x-4 gap-y-3">
					{#each stats as stat (stat.label)}
						<div class="flex flex-col-reverse justify-end">
							<dt class="text-xs text-muted-foreground"><Hint text={stat.hint}>{stat.label}</Hint>{#if stat.detail}<span class="block">{stat.detail}</span>{/if}</dt>
							<dd class="text-xl font-extrabold tabular-nums">{stat.value}</dd>
						</div>
					{/each}
				</dl>
			{/if}
			{#if card.kind === 'active'}
				{#if card.setupNeeded}
					<p class="mt-4 text-sm font-semibold text-status-warning-fg">Finish setting up payouts so we can pay your commission.</p>
				{/if}
				<div class="mt-4 flex flex-wrap gap-2">
					{#if overview.referralUrl}
						<Button variant="outline" size="sm" class="gap-2" on:click={copy}>
							{#if copied}<Check class="size-4" aria-hidden="true" />Copied{:else}<Copy class="size-4" aria-hidden="true" />Copy your link{/if}
						</Button>
					{/if}
					{@render portal(card.setupNeeded ? 'Finish setup' : 'Open the portal', 'outline')}
				</div>
			{:else}
				<div class="mt-4">{@render portal('Open the portal', 'outline')}</div>
			{/if}
		{/if}
	</Section>
{/if}
