<script lang="ts">
	import * as Avatar from '$lib/components/ui/avatar';
	import { cn } from '$lib/utils';

	let {
		name,
		src = null,
		initials,
		size = 'sm',
		kind = 'person',
		audience = 'practice'
	}: {
		name: string;
		src?: string | null;
		initials: string;
		/** 03 › Avatar: size-8 in tables, size-10 in lists, size-14 in page headers. */
		size?: 'sm' | 'md' | 'lg';
		/** Every avatar is a circle; an organisation's logo gets a border so it sits on white. */
		kind?: 'person' | 'org';
		/** A professional's fallback uses the pro (teal) accent. */
		audience?: 'practice' | 'pro';
	} = $props();

	const sizeClass = $derived(size === 'lg' ? 'size-14 text-lg' : size === 'md' ? 'size-10 text-sm' : 'size-8 text-xs');
	const shape = $derived(kind === 'org' ? 'rounded-full border' : 'rounded-full');
</script>

<Avatar.Root class={cn('shrink-0', sizeClass, shape)}>
	{#if src}
		<Avatar.Image
			{src}
			alt={name}
			class={cn(kind === 'org' ? 'bg-card object-contain p-1' : 'object-cover')}
		/>
	{/if}
	<Avatar.Fallback
		class={cn(
			'font-bold text-white',
			shape,
			audience === 'pro' ? 'bg-gradient-to-br from-pro to-pro-dark' : 'bg-gradient-to-br from-primary to-pro'
		)}
	>
		{initials}
	</Avatar.Fallback>
</Avatar.Root>
