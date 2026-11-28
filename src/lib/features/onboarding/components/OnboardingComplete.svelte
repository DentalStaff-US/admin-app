<script lang="ts">
	import { ArrowRight, CheckCircle2, Circle } from 'lucide-svelte';
	import Page from '$dtss/Page.svelte';
	import Stepper from '$dtss/Stepper.svelte';
	import { Button } from '$lib/components/ui/button';
	import { CLIENT_ONBOARDING_STEPS, stepIndex } from '../onboarding';
	import PracticeStack from './PracticeStack.svelte';

	let {
		firstName,
		companyName,
		billingSetUp
	}: { firstName?: string | null; companyName?: string | null; billingSetUp: boolean } = $props();

	const checklist = $derived([
		{ label: companyName ? `${companyName} is set up` : 'Your practice is set up', done: true },
		{ label: 'Your first location is added', done: true },
		{
			label: billingSetUp ? 'Billing is set up' : 'Billing: add a payment method any time in Settings › Billing',
			done: billingSetUp
		}
	]);
</script>

<Page width="narrow" class="max-w-5xl">
	<!-- Every step done. Phones skip it: their "Step n of 4" form has no done state. -->
	<div class="hidden sm:block"><Stepper steps={[...CLIENT_ONBOARDING_STEPS]} current={stepIndex('complete')} /></div>

	<!-- 03 › Card "Panel" + 04 §1 floating stack: a moment, not a workflow. -->
	<section class="overflow-hidden rounded-2xl bg-gradient-to-br from-primary-soft via-card to-primary-soft p-6 ring-1 ring-primary/15 sm:p-10">
		<div class="grid items-center gap-10 lg:grid-cols-2">
			<div>
				<p class="text-overline uppercase text-primary-dark">You're all set</p>
				<h1 class="mt-2 text-h1">Welcome to DTSS{firstName ? `, ${firstName}` : ''}</h1>
				<p class="mt-3 text-lg text-muted-foreground">
					Post a requisition and we'll match it with qualified professionals near you. Our team reviews new
					practices, and your requisitions go out to professionals once you're approved.
				</p>
				<ul class="mt-6 space-y-2">
					{#each checklist as item (item.label)}
						<li class="flex items-start gap-2 text-sm font-semibold">
							{#if item.done}
								<CheckCircle2 class="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
								<span class="sr-only">Done: </span>
							{:else}
								<Circle class="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
								<span class="sr-only">To do: </span>
							{/if}
							<span class={item.done ? '' : 'text-muted-foreground'}>{item.label}</span>
						</li>
					{/each}
				</ul>
				<div class="mt-8 flex flex-col gap-3 sm:flex-row">
					<Button size="lg" href="/requisitions">Post your first requisition <ArrowRight class="ml-2 size-4" aria-hidden="true" /></Button>
					<Button size="lg" variant="outline" href="/dashboard">Go to your dashboard</Button>
				</div>
			</div>
			<div class="hidden sm:block"><PracticeStack /></div>
		</div>
	</section>
</Page>
