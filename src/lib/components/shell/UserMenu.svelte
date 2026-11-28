<script lang="ts">
	import { goto } from '$app/navigation';
	import { ChevronDown, LogOut, Settings } from 'lucide-svelte';
	import * as Avatar from '$lib/components/ui/avatar';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';

	let {
		name,
		email,
		avatarUrl,
		initials
	}: { name: string; email?: string; avatarUrl?: string | null; initials: string } = $props();

	let signOutForm: HTMLFormElement;
</script>

<form bind:this={signOutForm} method="POST" action="/auth/sign-out" class="hidden"></form>

<DropdownMenu.Root>
	<DropdownMenu.Trigger
		aria-label="Account menu"
		class="flex h-11 items-center gap-1 rounded-md px-1 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
	>
		<Avatar.Root class="size-8">
			{#if avatarUrl}<Avatar.Image src={avatarUrl} alt="" />{/if}
			<Avatar.Fallback class="bg-gradient-to-br from-primary to-brand text-xs font-bold text-white">
				{initials}
			</Avatar.Fallback>
		</Avatar.Root>
		<ChevronDown class="size-4 text-muted-foreground" aria-hidden="true" />
	</DropdownMenu.Trigger>
	<DropdownMenu.Content class="w-60" align="end">
		<div class="px-2 py-1.5 text-sm">
			<p class="truncate font-bold">{name}</p>
			{#if email}<p class="truncate text-muted-foreground">{email}</p>{/if}
		</div>
		<DropdownMenu.Separator />
		<DropdownMenu.Item on:click={() => goto('/settings')} class="min-h-10 cursor-pointer">
			<Settings class="mr-2 size-4" aria-hidden="true" /> Settings
		</DropdownMenu.Item>
		<DropdownMenu.Item on:click={() => signOutForm.requestSubmit()} class="min-h-10 cursor-pointer">
			<LogOut class="mr-2 size-4" aria-hidden="true" /> Sign out
		</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>
