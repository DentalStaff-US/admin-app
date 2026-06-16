<!-- /inbox/[id]/+page.svelte -->
<script lang="ts">
	import * as Avatar from '$lib/components/ui/avatar';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Separator } from '$lib/components/ui/separator';
	import { Loader2, Send, MoreVertical, Phone, Video, Info, Paperclip, Smile } from 'lucide-svelte';
	import { afterUpdate, onMount, tick } from 'svelte';
	import { superForm } from 'sveltekit-superforms/client';
	import { cn } from '$lib/utils';
	import { invalidateAll } from '$app/navigation';

	export let data;

	let shouldScroll = false;
	let chatContainer: HTMLElement;

	const { enhance, submitting, form, reset } = superForm(data.form, {
		resetForm: true,
		clearOnSubmit: 'message',
		onResult: async ({ result }) => {
			console.log({ result });
			if (result.type === 'success') {
				await tick();
				scrollToBottom();
			}
			reset({
				data: {
					body: ''
				}
			});
		}
	});

	$: user = data.user;
	$: conversation = data.conversation;
	$: ({ messages } = conversation);
	$: ({ participants } = conversation);
	$: chatUsers = participants.filter((u) => u.userId !== user.id);

	$: if (messages) {
		shouldScroll = true;
	}

	onMount(() => {
		scrollToBottom();
		invalidateAll();
	});

	afterUpdate(() => {
		if (shouldScroll) {
			scrollToBottom();
			shouldScroll = false;
		}
	});

	const scrollToBottom = () => {
		if (chatContainer) {
			chatContainer.scrollTop = chatContainer.scrollHeight;
		}
	};

	function formatMessageTime(timestamp: string | Date) {
		const date = new Date(timestamp);
		return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
	}

	function formatMessageDate(timestamp: string | Date) {
		const date = new Date(timestamp);
		const today = new Date();
		const yesterday = new Date(today);
		yesterday.setDate(yesterday.getDate() - 1);

		if (date.toDateString() === today.toDateString()) {
			return 'Today';
		} else if (date.toDateString() === yesterday.toDateString()) {
			return 'Yesterday';
		} else {
			return date.toLocaleDateString();
		}
	}

	function shouldShowDateDivider(currentMessage: any, previousMessage: any) {
		if (!previousMessage) return true;

		const currentDate = new Date(currentMessage.createdAt).toDateString();
		const previousDate = new Date(previousMessage.createdAt).toDateString();

		return currentDate !== previousDate;
	}

	function handleKeyPress(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			const form = event.target?.closest('form');
			if (form && $form.body.trim()) {
				form.requestSubmit();
			}
		}
	}
</script>

<div class="flex flex-col h-full bg-background">
	<!-- Header -->
	<div class="flex items-center justify-between p-4 border-b bg-card">
		<div class="flex items-center gap-3">
			{#if chatUsers.length === 1}
				<Avatar.Root class="h-10 w-10">
					<Avatar.Image src={chatUsers[0]?.avatarUrl} alt={chatUsers[0]?.firstName} />
					<Avatar.Fallback class="text-lg">
						{chatUsers[0]?.firstName?.[0]}{chatUsers[0]?.lastName?.[0]}
					</Avatar.Fallback>
				</Avatar.Root>
			{/if}
			<div class="flex flex-wrap truncate max-w-lg">
				{#each chatUsers as user, index}
					<span class="font-semibold">
						{user.firstName}
						{user.lastName}
					</span>
					{#if index < chatUsers.length - 1}
						,
					{/if}
				{/each}
			</div>
		</div>

		<div class="flex items-center gap-2">
			<DropdownMenu.Root>
				<DropdownMenu.Trigger asChild let:builder>
					<Button variant="ghost" size="sm" class="h-9 w-9 p-0" builders={[builder]}>
						<MoreVertical class="h-4 w-4" />
					</Button>
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end">
					<DropdownMenu.Item>
						<Info class="h-4 w-4 mr-2" />
						View Profile
					</DropdownMenu.Item>
					<DropdownMenu.Separator />
					<DropdownMenu.Item class="text-destructive">Delete Conversation</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</div>
	</div>

	<!-- Messages -->
	<div bind:this={chatContainer} class="flex-1 overflow-y-auto p-4 space-y-4">
		{#if messages && messages.length > 0}
			{#each messages as message, index}
				<!-- Date divider -->
				{#if shouldShowDateDivider(message, messages[index - 1])}
					<div class="flex items-center justify-center my-6">
						<div class="flex items-center">
							<Separator class="flex-1" />
							<div class="px-3">
								<Badge
									variant="secondary"
									class="text-xs"
									value={formatMessageDate(message.createdAt)}
								></Badge>
							</div>
							<Separator class="flex-1" />
						</div>
					</div>
				{/if}

				<!-- Message -->
				<div
					class={cn(
						'flex gap-2 max-w-[80%]',
						message.senderId === user?.id ? 'ml-auto flex-row-reverse' : 'mr-auto'
					)}
				>
					{#if message.senderId !== user?.id}
						<Avatar.Root class="h-8 w-8 mt-auto">
							<Avatar.Image
								src={chatUsers.find((u) => u.userId === message.senderId)?.avatarUrl}
								alt={chatUsers.find((u) => u.userId === message.senderId)?.firstName}
							/>
							<Avatar.Fallback class="text-xs">
								{chatUsers.find((u) => u.userId === message.senderId)?.firstName?.[0]}
								{chatUsers.find((u) => u.userId === message.senderId)?.lastName?.[0]}
							</Avatar.Fallback>
						</Avatar.Root>
					{/if}

					<div
						class={cn(
							'flex flex-col gap-1',
							message.senderId === user?.id ? 'items-end' : 'items-start'
						)}
					>
						<div
							class={cn(
								'px-4 py-2 rounded-2xl max-w-sm word-wrap break-words',
								message.senderId === user?.id
									? 'bg-primary text-primary-foreground rounded-br-md'
									: 'bg-muted rounded-bl-md'
							)}
						>
							<p class="text-sm whitespace-pre-wrap">{message.body}</p>
						</div>
						<div class="flex items-center gap-2">
							<span class="text-xs text-muted-foreground">
								{formatMessageTime(message.createdAt)}
							</span>
						</div>
					</div>
				</div>
			{/each}
		{:else}
			<div class="flex flex-col items-center justify-center h-full text-center">
				<p class="text-muted-foreground mb-4">
					Start your conversation with {chatUsers?.map((u) => u.firstName).join(', ')}
				</p>
			</div>
		{/if}
	</div>

	<!-- Message Input -->
	<div class="border-t bg-card p-4">
		<form method="POST" action="?/sendNewMessage" use:enhance class="flex items-end gap-3">
			<div class="flex-1">
				<div class="flex items-center gap-2 p-3 border rounded-lg bg-background">
					<!-- <Button
						type="button"
						variant="ghost"
						size="sm"
						class="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
					>
						<Paperclip class="h-4 w-4" />
					</Button> -->

					<Input
						name="body"
						bind:value={$form.body}
						placeholder="Type a message..."
						class="border-0 bg-transparent p-0 focus-visible:ring-0 focus-visible:ring-offset-0"
						on:keypress={handleKeyPress}
						disabled={$submitting}
					/>
				</div>
			</div>

			<Button type="submit" disabled={$submitting || !$form.body.trim()} class="h-12 w-12 p-0">
				{#if $submitting}
					<Loader2 class="h-4 w-4 animate-spin" />
				{:else}
					<Send class="h-4 w-4" />
				{/if}
			</Button>
		</form>
	</div>
</div>
