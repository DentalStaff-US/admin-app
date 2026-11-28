<script lang="ts">
	import { CompanyStepForm, OnboardingFrame } from '$features/onboarding';

	let { data } = $props();
</script>

<OnboardingFrame step="company" title="Tell us about your practice" description="Let's get your practice set up on DTSS.">
	<CompanyStepForm form={data.form} />
</OnboardingFrame>
