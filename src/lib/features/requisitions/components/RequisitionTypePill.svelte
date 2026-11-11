<script lang="ts">
	import { Briefcase, CalendarDays } from 'lucide-svelte';
	import { cn } from '$lib/utils';

	let { permanent, class: className = '' }: { permanent: boolean | null | undefined; class?: string } = $props();
</script>

<!-- 03 › Type pill: Temp is always teal, Permanent always brand blue. -->
<span
	class={cn(
		'inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide',
		permanent ? 'bg-brand/10 text-brand-dark' : 'bg-pro/10 text-pro-dark',
		className
	)}
>
	{#if permanent}
		<Briefcase class="size-3.5" aria-hidden="true" /> Permanent
	{:else}
		<CalendarDays class="size-3.5" aria-hidden="true" /> Temp
	{/if}
</span>
