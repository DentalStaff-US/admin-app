<script lang="ts">
	import { page } from '$app/state';
	import { BillingStep, OnboardingFrame } from '$features/onboarding';

	let { data } = $props();
</script>

<OnboardingFrame step="billing" title="Set up billing" description="One last step. Choose how you'd like to pay for shifts; you can skip it for now.">
	<BillingStep subscriptionPending={data.subscriptionPending} canceled={page.url.searchParams.get('canceled') === '1'} />
</OnboardingFrame>
