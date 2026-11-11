<script lang="ts">
	import { LocationStepForm, OnboardingFrame } from '$features/onboarding';

	let { data } = $props();
</script>

<OnboardingFrame step="location" title="Add your main location" description="Where professionals will work. If you have more than one office, add the others later.">
	<LocationStepForm form={data.form} />
</OnboardingFrame>
