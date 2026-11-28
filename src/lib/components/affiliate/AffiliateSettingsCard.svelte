<script lang="ts">
	/**
	 * Affiliate card for the settings page.
	 *
	 * Deliberately minimal: status and link only. Everything else — earnings,
	 * referrals, payout history, Stripe setup — lives in the portal, and this
	 * card's job is to get the user there.
	 */
	import { Button } from '$lib/components/ui/button';
	import type { AffiliateSettingsStatus } from '$lib/server/affiliate/status';
	import StatusBadge from '$dtss/StatusBadge.svelte';

	export let status: AffiliateSettingsStatus;
	export let portalUrl: string;

	let copied = false;

	// The pill: label + a status-map key for its tone (never colour alone).
	$: badge =
		status.status === 'ACTIVE' && status.connectComplete
			? { status: 'ACTIVE', label: 'Active' }
			: status.status === 'ACTIVE'
				? { status: 'MISSING_GRACE', label: 'Setup incomplete' }
				: status.status === 'PENDING'
					? { status: 'PENDING', label: 'Awaiting approval' }
					: status.status === 'ON_HOLD'
						? { status: 'ON_HOLD', label: 'On hold' }
						: { status: 'INACTIVE', label: 'Inactive' };

	async function copyLink() {
		if (!status.referralUrl) return;
		try {
			await navigator.clipboard.writeText(status.referralUrl);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			copied = false;
		}
	}
</script>

<!-- The card is hidden entirely for ineligible accounts: a pending, inactive or
     denied practice/professional never sees the program exist. -->
{#if status.programEnabled && status.eligible}
	<div class="rounded-lg border bg-card p-6 shadow-card">
		<div class="flex items-start justify-between gap-4">
			<div>
				<h3 class="text-h3">Affiliate Program</h3>
				<p class="mt-1 text-sm text-muted-foreground">
					Earn commission when practices and professionals you refer work through DTSS.
				</p>
			</div>

			{#if status.enrolled}
				<StatusBadge status={badge.status} label={badge.label} />
			{/if}
		</div>

		{#if !status.enrolled}
			<div class="mt-4">
				<Button href={portalUrl} target="_blank" rel="noopener">Join the Affiliate Program</Button>
			</div>
		{:else if status.status === 'ACTIVE'}
			{#if status.referralUrl}
				<div class="mt-4">
					<span class="mb-1 block text-xs font-semibold text-muted-foreground">Your referral link</span>
					<div class="flex flex-wrap items-center gap-2">
						<code
							class="min-w-0 flex-1 overflow-x-auto rounded-md border bg-muted px-3 py-2 text-sm"
						>
							{status.referralUrl}
						</code>
						<Button variant="outline" on:click={copyLink}>
							{copied ? 'Copied' : 'Copy'}
						</Button>
					</div>
				</div>
			{/if}

			{#if !status.connectComplete}
				<p class="mt-3 text-sm text-status-warning-fg">
					Finish setting up payouts in the portal so we can pay your commission.
				</p>
			{/if}

			<div class="mt-4">
				<Button href={portalUrl} target="_blank" rel="noopener" variant="outline">
					{status.connectComplete ? 'Open Affiliate Portal' : 'Finish setup in the portal'}
				</Button>
			</div>
		{:else}
			<p class="mt-4 text-sm text-muted-foreground">
				{#if status.status === 'PENDING'}
					Your application is being reviewed. We'll email you once it's approved.
				{:else}
					Your affiliate account isn't active right now. Any commission you've already earned
					will still be paid out.
				{/if}
			</p>
			<div class="mt-4">
				<Button href={portalUrl} target="_blank" rel="noopener" variant="outline">
					Open Affiliate Portal
				</Button>
			</div>
		{/if}
	</div>
{/if}
