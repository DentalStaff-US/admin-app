<script lang="ts">
	import type { Snippet } from 'svelte';
	import { AlertCircle, AlertTriangle, CheckCircle2, Clock, Info } from 'lucide-svelte';
	import { cn } from '$lib/utils';

	const TONES = {
		info: { classes: 'border-primary/20 bg-primary-soft text-foreground [&_svg]:text-primary', icon: Info },
		pending: { classes: 'border-status-pending-border bg-status-pending-bg text-status-pending-fg', icon: Clock },
		warning: { classes: 'border-status-warning-border bg-status-warning-bg text-status-warning-fg', icon: AlertTriangle },
		negative: { classes: 'border-status-negative-border bg-status-negative-bg text-status-negative-fg', icon: AlertCircle },
		positive: { classes: 'border-status-positive-border bg-status-positive-bg text-status-positive-fg', icon: CheckCircle2 }
	};

	let {
		tone = 'info',
		title,
		alert = false,
		children
	}: { tone?: keyof typeof TONES; title?: string; alert?: boolean; children: Snippet } = $props();

	const config = $derived(TONES[tone]);
</script>

<div role={alert ? 'alert' : 'status'} class={cn('flex gap-3 rounded-xl border p-4 text-sm', config.classes)}>
	<config.icon class="mt-0.5 size-5 shrink-0" aria-hidden="true" />
	<div class="flex-1">
		{#if title}<p class="font-bold">{title}</p>{/if}
		<div class={title ? 'mt-0.5' : ''}>{@render children()}</div>
	</div>
</div>
