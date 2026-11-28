<script lang="ts">
	import type { Snippet } from 'svelte';
	import Page from '$dtss/Page.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';
	import Stepper from '$dtss/Stepper.svelte';
	import { CLIENT_ONBOARDING_STEPS, stepIndex, type ClientOnboardingStep } from '../onboarding';

	// The focus shell (logo + Sign out) comes from the protected layout; this is
	// the page inside it: the Stepper, the step's title and its card.
	let {
		step,
		title,
		description,
		children
	}: { step: ClientOnboardingStep; title: string; description?: string; children: Snippet } = $props();
</script>

<Page width="narrow" class="max-w-2xl">
	<Stepper steps={[...CLIENT_ONBOARDING_STEPS]} current={stepIndex(step)} />
	<PageHeader {title} {description} />
	{@render children()}
</Page>
