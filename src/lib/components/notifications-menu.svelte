<script lang="ts">
	import { Bell } from 'lucide-svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Button } from '$lib/components/ui/button';

	export let notifications: any[];
</script>

<!--  -->

<DropdownMenu.Root>
	<DropdownMenu.Trigger asChild let:builder>
		<Button variant="ghost" builders={[builder]} class="relative h-10 w-10">
			<div class="flex items-center justify-center relative">
				<Bell size={30} />
				{#if notifications.length > 0}
					<div
						class="absolute -bottom-1 left-3 bg-destructive px-2 rounded-full text-white text-[10px]"
					>
						{notifications.length > 20 ? '20+' : notifications.length}
					</div>
				{/if}
			</div>
		</Button>
	</DropdownMenu.Trigger>
	<DropdownMenu.Content
		class="p-0 bg-gray-50 w-96 h-fit max-h-[600px] overflow-hidden flex flex-col"
		align="end"
	>
		<DropdownMenu.Label
			class="font-normal bg-white rounded-t-[inherit] p-0 border-b border-b-gray-100"
		>
			<div class="flex justify-between space-y-1 items-center p-4">
				<p class="text-lg font-medium leading-none">Notifications</p>
				{#if notifications.length > 0}
					<Button class="text-xs p-0 h-fit" variant="link">Mark all as read</Button>
				{/if}
			</div>
		</DropdownMenu.Label>
		<div class="overflow-y-auto grow">
			{#if notifications.length > 0}
				{#each notifications as notification, index}
					{#if index === notifications.length - 1}
						<div class="p-4 bg-white hover:bg-gray-50 rounded-b-[inherit]">
							<p class="font-semibold">Notification Title</p>
							<p class="">Some Notification Description</p>
						</div>
					{:else}
						<div class="p-4 bg-white hover:bg-gray-50">
							<p class="font-semibold">Notification Title</p>
							<p class="">Some Notification Description</p>
						</div>
					{/if}
				{/each}
			{:else}
				<p class="p-3 text-center">No Notifications Yet</p>
			{/if}
		</div>
	</DropdownMenu.Content>
</DropdownMenu.Root>
