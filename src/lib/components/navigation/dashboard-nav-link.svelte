<script lang="ts">
	import { ChevronDown, LayoutGrid } from 'lucide-svelte';
	import { cn } from '$lib/utils';
	import { goto } from '$app/navigation';

	export let expanded: boolean;
	let opened: boolean = false;
	export let link: {
		name: string;
		path?: string;
		children?: { name: string; path: string }[];
	};

	$: {
		if (!expanded) {
			opened = false;
		}
	}

	function handleLinkDropdown() {
		expanded ? (opened = !opened) : (expanded = true);
	}

	function handleLinkClick(link: string) {
		if (expanded) {
			goto(link);
			expanded = false;
		} else {
			expanded = true;
		}
	}
</script>

{#if link?.children}
	<li class="w-full">
		<button
			on:click={handleLinkDropdown}
			class="w-full text-left flex gap-x-4 p-2 text-white hover:bg-primary/90 cursor-pointer rounded-sm items-center transition-all duration-100"
		>
			<slot />
			<span
				class={cn(
					'grow origin-left text-white text-sm whitespace-nowrap text-nowrap leading-none',
					!expanded && 'hidden'
				)}>{link.name}</span
			>
			<ChevronDown
				class={cn(
					'transition-all duration-100',
					!expanded && 'hidden',
					opened ? 'rotate-180' : 'rotate-0'
				)}
			/>
		</button>
		<div
			class={cn(
				'overflow-hidden transition-all duration-300 pl-8 flex flex-col gap-2 pt-2',
				expanded && opened ? 'h-fit' : 'h-0'
			)}
		>
			{#each link.children as childLink}
				<button
					on:click={() => childLink?.path && handleLinkClick(childLink.path)}
					class="text-left text-sm text-white">{childLink.name}</button
				>
			{/each}
		</div>
	</li>
{:else}
	<li>
		<button
			on:click={() => link?.path && handleLinkClick(link.path)}
			class="w-full text-left flex gap-x-4 p-2 text-white hover:bg-primary/90 cursor-pointer rounded-sm items-center transition-all duration-300"
		>
			<slot />
			<span
				class={cn(
					'grow origin-left text-white text-sm leading-none',
					!expanded
						? 'opacity-0'
						: 'opacity-100 whitespace-nowrap text-nowrap transition-all duration-300'
				)}>{link.name}</span
			>
		</button>
	</li>
{/if}
