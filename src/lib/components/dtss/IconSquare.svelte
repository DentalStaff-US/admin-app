<script lang="ts">
	import { cn } from '$lib/utils';

	const TONES = {
		primary: 'bg-primary/10 text-primary-dark',
		positive: 'bg-status-positive-bg text-status-positive-fg',
		info: 'bg-status-info-bg text-status-info-fg',
		pending: 'bg-status-pending-bg text-status-pending-fg',
		warning: 'bg-status-warning-bg text-status-warning-fg',
		negative: 'bg-status-negative-bg text-status-negative-fg',
		neutral: 'bg-status-neutral-bg text-status-neutral-fg'
	};

	let {
		icon: Icon,
		tone = 'primary',
		class: className = ''
	}: { icon: any; tone?: keyof typeof TONES; class?: string } = $props();
</script>

<span class={cn('inline-flex size-11 shrink-0 items-center justify-center rounded-lg', TONES[tone], className)}>
	<Icon class="size-6" aria-hidden="true" />
</span>
