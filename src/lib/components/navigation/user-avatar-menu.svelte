<script lang="ts">
	import { Cog, LogOut, Moon, Sun, SunMoon, UserRound } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Command from '$lib/components/ui/command';
	import * as Avatar from '$lib/components/ui/avatar';
	import convertNameToInitials from '$lib/_helpers/convertNameToInitials';
	import { setMode, resetMode } from 'mode-watcher';
	import type { AppUser as User } from '$lib/server/auth';

	export let user: User | null;

	let initials: string = '';
	$: {
		if (user) {
			initials = convertNameToInitials(user.firstName, user.lastName);
		}
	}
	function signOut() {
		// Create a form element
		var form = document.createElement('form');
		form.method = 'POST';
		form.action = '/auth/sign-out';
		document.body.appendChild(form);
		form.submit();
	}
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger asChild let:builder>
		<Button variant="link" builders={[builder]} class="relative h-10 w-10">
			<Avatar.Root class="h-8 w-8">
				<Avatar.Image
					class="aspect-square h-full w-full rounded-full"
					src={user?.avatarUrl || ''}
					alt={user ? `${user.firstName} ${user.lastName}` : 'User Avatar'}
				/>
				<Avatar.Fallback>{initials}</Avatar.Fallback>
			</Avatar.Root>
		</Button>
	</DropdownMenu.Trigger>
	<DropdownMenu.Content class="w-56" align="end">
		<DropdownMenu.Label class="font-normal">
			<div class="flex flex-col space-y-1">
				<p class="text-sm font-medium leading-none">{user?.firstName} {user?.lastName}</p>
				<p class="text-xs leading-none text-muted-foreground">{user?.email}</p>
			</div>
		</DropdownMenu.Label>
		<DropdownMenu.Separator />
		<DropdownMenu.Group>
			<DropdownMenu.Item on:click={() => goto('/settings')}>
				<Cog class="mr-2 h-4 w-4" />
				Settings
			</DropdownMenu.Item>
		</DropdownMenu.Group>
		<DropdownMenu.Separator />
		<DropdownMenu.Item on:click={signOut}>
			<LogOut class="mr-2 h-4 w-4" />
			Sign out
			<DropdownMenu.Shortcut>⇧⌘Q</DropdownMenu.Shortcut>
		</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>
