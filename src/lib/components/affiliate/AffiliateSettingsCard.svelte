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

	export let status: AffiliateSettingsStatus;
	export let portalUrl: string;

	let copied = false;

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
	<div class="rounded-lg border border-gray-200 bg-white p-6">
		<div class="flex items-start justify-between gap-4">
			<div>
				<h3 class="text-lg font-semibold text-gray-900">Affiliate Program</h3>
				<p class="mt-1 text-sm text-gray-600">
					Earn commission when practices and professionals you refer work through DTSS.
				</p>
			</div>

			{#if status.enrolled}
				<span
					class="shrink-0 rounded-full px-3 py-1 text-xs font-medium
					{status.status === 'ACTIVE' && status.connectComplete
						? 'bg-green-100 text-green-800'
						: status.status === 'ACTIVE'
							? 'bg-amber-100 text-amber-800'
							: 'bg-gray-100 text-gray-700'}"
				>
					{#if status.status === 'ACTIVE' && status.connectComplete}
						Active
					{:else if status.status === 'ACTIVE'}
						Setup incomplete
					{:else if status.status === 'PENDING'}
						Awaiting approval
					{:else if status.status === 'ON_HOLD'}
						On hold
					{:else}
						Inactive
					{/if}
				</span>
			{/if}
		</div>

		{#if !status.enrolled}
			<div class="mt-4">
				<Button href={portalUrl} target="_blank" rel="noopener">Join the Affiliate Program</Button>
			</div>
		{:else if status.status === 'ACTIVE'}
			{#if status.referralUrl}
				<div class="mt-4">
					<span class="mb-1 block text-xs font-medium text-gray-500">Your referral link</span>
					<div class="flex flex-wrap items-center gap-2">
						<code
							class="min-w-0 flex-1 overflow-x-auto rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
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
				<p class="mt-3 text-sm text-amber-700">
					Finish setting up payouts in the portal so we can pay your commission.
				</p>
			{/if}

			<div class="mt-4">
				<Button href={portalUrl} target="_blank" rel="noopener" variant="outline">
					{status.connectComplete ? 'Open Affiliate Portal' : 'Finish setup in the portal'}
				</Button>
			</div>
		{:else}
			<p class="mt-4 text-sm text-gray-600">
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
