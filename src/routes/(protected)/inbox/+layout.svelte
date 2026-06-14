<!-- /inbox/+layout.svelte -->
<script lang="ts">
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import * as Avatar from '$lib/components/ui/avatar';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Command from '$lib/components/ui/command';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { cn } from '$lib/utils';
	import type { LayoutData } from './$types';
	import { PenBox, Search, ArrowLeft, MessageCircle, Users, X } from 'lucide-svelte';
	import { onMount } from 'svelte';
	import { superForm } from 'sveltekit-superforms/client';

	export let data: LayoutData;

	let searchTerm: string = '';
	let isMobile = false;
	let showNewMessageDialog = false;
	let selectedUsers: any[] = [];
	let userSearchTerm = '';

	$: pageObj = $page;
	$: user = data.user;
	$: availableUsers = data.availableUsers || [];
	$: isNestedRoute = pageObj.params.chatId !== undefined;
	$: conversations = data.conversations.map((conv) => ({
		...conv,
		participants: conv.participants.filter((p) => p.userId !== user.id)
	}));

	$: filteredConversations = conversations.filter(
		(conv) =>
			conv.participants.some(
				(p) =>
					p.user?.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
					p.user?.lastName?.toLowerCase().includes(searchTerm.toLowerCase())
			) || conv.lastMessage?.body?.toLowerCase().includes(searchTerm.toLowerCase())
	);

	$: filteredUsers = availableUsers
		.filter(
			(u) =>
				u.firstName?.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
				u.lastName?.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
				u.email?.toLowerCase().includes(userSearchTerm.toLowerCase())
		)
		.filter((u) => u.id !== user.id);

	$: stringifiedUserIds = JSON.stringify(selectedUsers.map((u) => u.id));

	onMount(() => {
		const checkMobile = () => {
			isMobile = window.innerWidth < 1024;
		};

		checkMobile();
		window.addEventListener('resize', checkMobile);

		return () => {
			window.removeEventListener('resize', checkMobile);
		};
	});

	function handleNewMessage() {
		showNewMessageDialog = true;
	}

	function toggleUserSelection(selectedUser: any) {
		const index = selectedUsers.findIndex((u) => u.id === selectedUser.id);
		if (index > -1) {
			selectedUsers = selectedUsers.filter((u) => u.id !== selectedUser.id);
		} else {
			selectedUsers = [...selectedUsers, selectedUser];
		}
	}

	function removeSelectedUser(userId: string) {
		selectedUsers = selectedUsers.filter((u) => u.id !== userId);
	}

	// async function startNewConversation() {
	// 	if (selectedUsers.length === 0) return;

	// 	// TODO: Implement conversation creation logic
	// 	console.log('Starting conversation with:', selectedUsers);

	// 	// Reset state
	// 	selectedUsers = [];
	// 	userSearchTerm = '';
	// 	showNewMessageDialog = false;

	// 	// Navigate to new conversation (you'll need to implement this)
	// 	// goto('/inbox/new-conversation-id');
	// }

	function formatLastSeen(date: string | Date) {
		// Simple date formatting - enhance as needed
		const now = new Date();
		const messageDate = new Date(date);
		const diffMs = now.getTime() - messageDate.getTime();
		const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
		const diffDays = Math.floor(diffHours / 24);

		if (diffHours < 1) return 'Just now';
		if (diffHours < 24) return `${diffHours}h ago`;
		if (diffDays < 7) return `${diffDays}d ago`;
		return messageDate.toLocaleDateString();
	}

	const { form, enhance, submitting } = superForm(data.newConversationForm);
</script>

<div class="flex h-screen bg-background">
	<!-- Sidebar - Hidden on mobile when viewing conversation -->
	<div
		class={cn(
			'flex flex-col border-r bg-card transition-all duration-300 w-[350px]',
			isMobile && (isNestedRoute ? 'hidden' : 'w-full')
		)}
	>
		<!-- Header -->
		<div class="flex items-center justify-between p-4 border-b">
			<div class="flex items-center gap-2">
				<MessageCircle class="h-6 w-6" />
				<h1 class="text-xl font-semibold">Messages</h1>
			</div>
			<Button variant="ghost" size="sm" class="h-9 w-9 p-0" on:click={handleNewMessage}>
				<PenBox class="h-4 w-4" />
			</Button>
		</div>

		<!-- Search -->
		<div class="p-4 border-b">
			<div class="relative">
				<Search
					class="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground"
				/>
				<Input bind:value={searchTerm} placeholder="Search conversations..." class="pl-9" />
			</div>
		</div>

		<!-- Conversations List -->
		<div class="flex-1 overflow-y-auto">
			{#each filteredConversations as conversation (conversation.id)}
				{@const participants = conversation.participants}
				{@const isActive = pageObj.params.chatId === conversation.id}
				<a
					href="/inbox/{conversation.id}"
					class={cn(
						'flex items-center gap-3 p-4 border-b hover:bg-accent transition-colors',
						isActive && 'bg-accent'
					)}
				>
					<Avatar.Root class="h-12 w-12">
						<Avatar.Image
							src={participants[0]?.user?.avatarUrl}
							alt={participants[0]?.user?.firstName}
						/>
						<Avatar.Fallback>
							{participants[0]?.user?.firstName?.[0]}{participants[0]?.user?.lastName?.[0]}
						</Avatar.Fallback>
					</Avatar.Root>

					<div class="flex-1 min-w-0">
						<div class="flex items-center">
							{#each participants as participant, index}
								<span class="font-semibold">
									{participant.user?.firstName}
									{participant.user?.lastName}
								</span>
								{#if index < participants.length - 1}
									,
								{/if}
							{/each}
						</div>
						{#if conversation.lastMessage}
							<p class="text-sm text-muted-foreground truncate max-w-[250px]">
								{conversation.lastMessage.body}
							</p>
							{#if conversation.lastMessage}
								<span class="text-xs text-muted-foreground">
									{formatLastSeen(conversation.lastMessage.createdAt)}
								</span>
							{/if}
						{:else}
							<p class="text-sm text-muted-foreground italic">No messages yet</p>
						{/if}
					</div>

					{#if conversation.unreadCount > 0}
						<Badge
							variant="default"
							class="h-5 min-w-5 max-w-10 text-xs"
							value={conversation.unreadCount <= 9 ? conversation.unreadCount : '9+'}
						/>
					{/if}
				</a>
			{/each}

			{#if filteredConversations.length === 0}
				<div class="flex flex-col items-center justify-center p-8 text-center">
					<MessageCircle class="h-12 w-12 text-muted-foreground mb-4" />
					<h3 class="font-medium mb-2">No conversations found</h3>
					<p class="text-sm text-muted-foreground mb-4">
						{searchTerm ? 'Try adjusting your search' : 'Start a new conversation'}
					</p>
					<Button size="sm" on:click={handleNewMessage}>
						<PenBox class="h-4 w-4 mr-2" />
						New Message
					</Button>
				</div>
			{/if}
		</div>
	</div>

	<!-- Main Content -->
	<div class="flex-1 flex flex-col">
		{#if isNestedRoute}
			<!-- Mobile back button -->
			{#if isMobile}
				<div class="flex items-center gap-2 p-4 border-b lg:hidden">
					<Button variant="ghost" size="sm" class="h-9 w-9 p-0" on:click={() => history.back()}>
						<ArrowLeft class="h-4 w-4" />
					</Button>
				</div>
			{/if}
			<slot />
		{:else}
			<div class="flex-1 hidden lg:flex items-center justify-center bg-muted/30">
				<div class="text-center">
					<MessageCircle class="h-16 w-16 text-muted-foreground mx-auto mb-4" />
					<h2 class="text-xl font-semibold mb-2">Select a conversation</h2>
					<p class="text-muted-foreground mb-6">
						Choose a conversation from the sidebar to start messaging
					</p>
					<Button on:click={handleNewMessage}>
						<PenBox class="h-4 w-4 mr-2" />
						Start New Conversation
					</Button>
				</div>
			</div>
		{/if}
	</div>
</div>

<!-- New Message Dialog -->
<Dialog.Root bind:open={showNewMessageDialog}>
	<Dialog.Content class="sm:max-w-[500px]">
		<form class="space-y-4" method="POST" action="?/startConversation" use:enhance>
			<Dialog.Header>
				<Dialog.Title>New Message</Dialog.Title>
				<Dialog.Description>Select people to start a new conversation with.</Dialog.Description>
			</Dialog.Header>

			<div class="space-y-4">
				<!-- Selected Users -->
				{#if selectedUsers.length > 0}
					<div class="flex flex-wrap gap-2">
						{#each selectedUsers as selectedUser (selectedUser.id)}
							<Badge
								variant="secondary"
								class="flex items-center gap-1"
								value={`${selectedUser.firstName} ${selectedUser.lastName}`}
							>
								<Button
									variant="ghost"
									size="sm"
									class="h-4 w-4 p-0 hover:bg-transparent"
									on:click={() => removeSelectedUser(selectedUser.id)}
								>
									<X class="h-3 w-3" />
								</Button>
							</Badge>
						{/each}
					</div>
				{/if}

				<!-- User Search -->
				<div class="relative">
					<Users
						class="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground"
					/>
					<Input bind:value={userSearchTerm} placeholder="Search people..." class="pl-9" />
				</div>

				<!-- User List -->
				<div class="max-h-60 overflow-y-auto border rounded-md">
					{#each filteredUsers as availableUser (availableUser.id)}
						{@const isSelected = selectedUsers.some((u) => u.id === availableUser.id)}
						<button
							type="button"
							class={cn(
								'w-full flex items-center gap-3 p-3 hover:bg-accent transition-colors text-left',
								isSelected && 'bg-accent'
							)}
							on:click={() => toggleUserSelection(availableUser)}
						>
							<Avatar.Root class="h-10 w-10">
								<Avatar.Image src={availableUser.avatarUrl} alt={availableUser.firstName} />
								<Avatar.Fallback>
									{availableUser.firstName?.[0]}{availableUser.lastName?.[0]}
								</Avatar.Fallback>
							</Avatar.Root>
							<div class="flex-1">
								<p class="font-medium">
									{availableUser.firstName}
									{availableUser.lastName}
								</p>
								<p class="text-sm text-muted-foreground">
									{availableUser.email}
								</p>
							</div>
							{#if isSelected}
								<div class="h-4 w-4 rounded-full bg-primary flex items-center justify-center">
									<div class="h-2 w-2 rounded-full bg-primary-foreground"></div>
								</div>
							{/if}
						</button>
					{/each}

					{#if filteredUsers.length === 0}
						<div class="p-4 text-center text-sm text-muted-foreground">No people found</div>
					{/if}
				</div>
			</div>
			<input type="hidden" name="userIDs" bind:value={stringifiedUserIds} />
			<Dialog.Footer>
				<Button type="button" variant="destructiveOutline" on:click={() => (showNewMessageDialog = false)}
					>Cancel</Button
				>
				<Button type="submit" disabled={selectedUsers.length === 0}>
					{#if $submitting}
						Please Wait...
					{:else}
						Start Conversation
					{/if}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
