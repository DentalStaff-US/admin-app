<script lang="ts">
	import { MessagesSquare, PenSquare, Search } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { cn } from '$lib/utils';
	import ConversationAvatar from './ConversationAvatar.svelte';
	import { describeConversation, filterConversations, relativeTime, unreadOf, type InboxConversation } from '../inbox';

	let {
		conversations,
		userId,
		activeId = null,
		onNew
	}: {
		conversations: InboxConversation[];
		userId?: string;
		activeId?: string | null;
		onNew: () => void;
	} = $props();

	let query = $state('');
	const visible = $derived(filterConversations(conversations, query, userId));
</script>

<div class="flex h-full min-h-0 flex-col">
	<header class="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-3">
		<h1 class="text-h2">Inbox</h1>
		<Button size="sm" on:click={onNew}>
			<PenSquare class="mr-2 size-4" aria-hidden="true" />New message
		</Button>
	</header>

	{#if conversations.length}
		<div class="shrink-0 border-b p-3">
			<div class="relative">
				<Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
				<Input type="search" aria-label="Search conversations" placeholder="Search people, jobs or messages" class="pl-9" bind:value={query} />
			</div>
		</div>
	{/if}

	<!-- `relative` keeps the sr-only text inside the scroll clipping. -->
	<nav aria-label="Conversations" class="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
		{#if visible.length}
			<ul class="divide-y">
				{#each visible as conversation (conversation.id)}
					{@const about = describeConversation(conversation, userId)}
					{@const unread = unreadOf(conversation) > 0}
					{@const active = conversation.id === activeId}
					<li>
						<a
							href="/inbox/{conversation.id}"
							aria-current={active ? 'page' : undefined}
							class={cn(
								'relative flex items-start gap-3 px-4 py-3 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
								active && 'bg-primary-soft hover:bg-primary-soft'
							)}
						>
							{#if active}<span class="absolute inset-y-0 left-0 w-[3px] bg-primary" aria-hidden="true"></span>{/if}
							<ConversationAvatar initials={about.initials} avatarUrl={about.avatarUrl} group={about.group} />
							<span class="min-w-0 flex-1">
								<span class="flex items-baseline justify-between gap-3">
									<span class="flex min-w-0 items-center gap-2">
										{#if unread}
											<span class="size-2 shrink-0 rounded-full bg-primary-strong" aria-hidden="true"></span>
											<span class="sr-only">Unread:</span>
										{/if}
										<span class="truncate font-bold">{about.title}</span>
									</span>
									{#if conversation.lastMessage?.createdAt}
										<time class="shrink-0 text-xs text-muted-foreground" datetime={new Date(conversation.lastMessage.createdAt).toISOString()}>
											{relativeTime(conversation.lastMessage.createdAt)}
										</time>
									{/if}
								</span>
								{#if about.subtitle}<span class="block truncate text-sm text-muted-foreground">{about.subtitle}</span>{/if}
								{#if conversation.lastMessage?.body}
									<span class={cn('mt-0.5 block truncate text-sm', unread ? 'font-bold text-foreground' : 'text-muted-foreground')}>
										{conversation.lastMessage.body}
									</span>
								{:else}
									<span class="mt-0.5 block text-sm italic text-muted-foreground">No messages yet</span>
								{/if}
							</span>
							{#if unread}
								<span class="mt-0.5 shrink-0 rounded-full bg-primary-strong px-1.5 text-xs font-bold leading-5 text-primary-foreground tabular-nums">
									{unreadOf(conversation) > 9 ? '9+' : unreadOf(conversation)}<span class="sr-only"> unread</span>
								</span>
							{/if}
						</a>
					</li>
				{/each}
			</ul>
		{:else if query.trim()}
			<div class="px-6 py-10 text-center">
				<p class="font-bold">No results for “{query.trim()}”</p>
				<p class="mt-1 text-sm text-muted-foreground">Try a name, a job or part of a message.</p>
				<Button variant="outline" size="sm" class="mt-4" on:click={() => (query = '')}>Clear search</Button>
			</div>
		{:else}
			<div class="flex flex-col items-center px-6 py-10 text-center">
				<span class="inline-flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary-dark">
					<MessagesSquare class="size-6" aria-hidden="true" />
				</span>
				<p class="mt-3 font-bold">No conversations yet</p>
				<p class="mt-1 text-sm text-muted-foreground">Messages with professionals, practices and the DTSS team show up here.</p>
				<Button size="sm" class="mt-4" on:click={onNew}>New message</Button>
			</div>
		{/if}
	</nav>
</div>
