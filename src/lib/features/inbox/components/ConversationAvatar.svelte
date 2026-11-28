<script lang="ts">
	import { cn } from '$lib/utils';
	import { Users } from 'lucide-svelte';

	let {
		initials,
		avatarUrl = null,
		group = false,
		size = 'md'
	}: { initials: string; avatarUrl?: string | null; group?: boolean; size?: 'sm' | 'md' } = $props();

	const box = $derived(size === 'sm' ? 'size-8 text-xs' : 'size-10 text-sm');
</script>

<!-- 03 › Avatar: people are round; initials on the brand gradient. Group threads show a people icon. -->
{#if avatarUrl}
	<img src={avatarUrl} alt="" class={cn('shrink-0 rounded-full border bg-card object-cover', box)} />
{:else if group}
	<span class={cn('flex shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-dark', box)} aria-hidden="true">
		<Users class="size-4" />
	</span>
{:else}
	<span
		class={cn('flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-pro font-bold text-white', box)}
		aria-hidden="true"
	>
		{initials}
	</span>
{/if}
