<script lang="ts">
	import { OnboardingFrame, StaffStepForm } from '$features/onboarding';

	let { data } = $props();
</script>

<OnboardingFrame step="staff" title="Invite your team" description="Give office managers and staff their own sign-in. You can skip this and invite people later.">
	<StaffStepForm form={data.form} />
</OnboardingFrame>
