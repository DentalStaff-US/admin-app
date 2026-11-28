<script lang="ts">
	import AffiliateSettingsCard from '$lib/components/affiliate/AffiliateSettingsCard.svelte';
	import type { AffiliateSettingsStatus } from '$lib/server/affiliate/status';
	import SettingsPanel from './SettingsPanel.svelte';

	let { status, portalUrl }: { status: AffiliateSettingsStatus; portalUrl: string } = $props();
</script>

<SettingsPanel title="Affiliate program" description="Your referral link, earnings and payouts live in the partner portal.">
	<AffiliateSettingsCard {status} {portalUrl} />
</SettingsPanel>
