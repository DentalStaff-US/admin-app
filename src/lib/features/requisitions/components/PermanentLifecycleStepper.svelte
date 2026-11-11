<script lang="ts">
	import { Check } from 'lucide-svelte';
	import Hint from '$dtss/Hint.svelte';
	import StatusBadge from '$dtss/StatusBadge.svelte';
	import { cn } from '$lib/utils';
	import {
		currentStep,
		isComplete,
		isExited,
		lifecycleSteps,
		type Audience,
		type FeeState,
		type StageCounts
	} from '../permanentLifecycle';

	let {
		requisitionId,
		status,
		counts,
		fee,
		audience
	}: {
		requisitionId: number | string;
		status: string;
		counts: StageCounts;
		fee: FeeState;
		audience: Audience;
	} = $props();

	// The shared Stepper takes labels only; this one carries a count per step,
	// and every count links to exactly the set it counts (06 › Permanent hiring).
	const steps = $derived(lifecycleSteps({ requisitionId, audience, counts, fee }));
	const current = $derived(currentStep(status, counts));
	const complete = $derived(isComplete(status));
	const exited = $derived(isExited(status));
	const done = (i: number) => complete || i < current;
</script>

<section aria-label="Hiring progress" class="rounded-lg border bg-card p-4 shadow-card sm:p-5">
	<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
		<h2 class="text-overline uppercase text-muted-foreground">Hiring progress</h2>
		{#if exited}
			<StatusBadge {status} label={status === 'CANCELED' ? 'Canceled before a hire' : 'Closed'} />
		{/if}
	</div>

	<!-- Phones: the current step plus a thin bar, and the counts as a compact list. -->
	<div class="sm:hidden">
		<p class="text-sm font-semibold">
			Step {current + 1} of {steps.length} · {steps[current].label}
		</p>
		<div class="mt-2 h-1 rounded-full bg-border" aria-hidden="true">
			<div class="h-1 rounded-full bg-primary" style={`width: ${((current + 1) / steps.length) * 100}%`}></div>
		</div>
		<ul class="mt-3 grid grid-cols-3 gap-2">
			{#each steps.filter((s) => s.count !== null) as step (step.key)}
				<li>
					<a href={step.href} class="block rounded-md bg-muted px-2 py-1.5 text-center hover:bg-accent">
						<span class="block text-lg font-extrabold tabular-nums">{step.count}</span>
						<span class="text-caption text-muted-foreground">{step.label}</span>
					</a>
				</li>
			{/each}
		</ul>
	</div>

	<ol class="hidden items-start gap-2 sm:flex">
		{#each steps as step, i (step.key)}
			<li class="flex min-w-0 flex-col items-start gap-1.5" aria-current={i === current && !complete ? 'step' : undefined}>
				<div class="flex items-center gap-2">
					<span
						class={cn(
							'flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-extrabold',
							done(i) && 'bg-primary-strong text-primary-foreground',
							!done(i) && i === current && 'text-primary-dark ring-2 ring-primary',
							!done(i) && i > current && 'bg-muted text-muted-foreground'
						)}
					>
						{#if done(i)}<Check class="size-4" aria-hidden="true" /><span class="sr-only">Done: </span>{:else}{i + 1}{/if}
					</span>
					<Hint text={step.hint} class={cn('text-sm font-semibold', !done(i) && i > current && 'text-muted-foreground')}>
						{step.label}
					</Hint>
				</div>
				<div class="pl-10 text-sm">
					{#if step.count !== null && step.href}
						<a href={step.href} class="font-extrabold tabular-nums text-primary-dark hover:underline">
							{step.count}<span class="sr-only"> {step.label.toLowerCase()}</span>
						</a>
					{/if}
					{#if step.detail}
						{#if step.key === 'FEE' && step.href}
							<a href={step.href} class="text-muted-foreground hover:underline">{step.detail}</a>
						{:else}
							<span class="text-muted-foreground">{step.count !== null ? '· ' : ''}{step.detail}</span>
						{/if}
					{/if}
				</div>
			</li>
			{#if i < steps.length - 1}
				<li aria-hidden="true" class={cn('mt-4 h-0.5 min-w-3 flex-1 rounded', done(i + 1) || i < current ? 'bg-primary' : 'bg-border')}></li>
			{/if}
		{/each}
	</ol>
</section>
