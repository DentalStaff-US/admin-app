<script lang="ts">
	import { OnboardingComplete } from '$features/onboarding';

	let { data } = $props();
</script>

<svelte:head><title>You're all set | DTSS</title></svelte:head>

<OnboardingComplete firstName={data.user?.firstName} companyName={data.summary.companyName} billingSetUp={data.summary.billingSetUp} />
