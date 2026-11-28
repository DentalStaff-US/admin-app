<script lang="ts">
	import { Check } from 'lucide-svelte';
	import { cn } from '$lib/utils';

	let { steps, current }: { steps: string[]; current: number } = $props();
</script>

<!-- Phones get the short form (03 Stepper). -->
<div class="sm:hidden">
	<p class="text-sm font-semibold">Step {current + 1} of {steps.length} · {steps[current]}</p>
	<div class="mt-2 h-1 rounded-full bg-border" aria-hidden="true">
		<div class="h-1 rounded-full bg-primary transition-all duration-base" style={`width: ${((current + 1) / steps.length) * 100}%`}></div>
	</div>
</div>

<ol class="hidden items-center gap-2 sm:flex">
	{#each steps as step, index (step)}
		<li class="flex items-center gap-2" aria-current={index === current ? 'step' : undefined}>
			<span
				class={cn(
					'flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-extrabold',
					index < current && 'bg-primary-strong text-primary-foreground',
					index === current && 'text-primary-dark ring-2 ring-primary',
					index > current && 'bg-muted text-muted-foreground'
				)}
			>
				{#if index < current}<Check class="size-4" aria-hidden="true" /><span class="sr-only">Done: </span>{:else}{index + 1}{/if}
			</span>
			<span class={cn('text-sm font-semibold', index > current && 'text-muted-foreground')}>{step}</span>
		</li>
		{#if index < steps.length - 1}
			<li aria-hidden="true" class={cn('h-0.5 min-w-3 flex-1 rounded', index < current ? 'bg-primary' : 'bg-border')}></li>
		{/if}
	{/each}
</ol>
