<script lang="ts">
	// Two panes inside the shell's full-height, non-scrolling main: the list on
	// the left and the thread (or a placeholder) on the right. Phones show one
	// pane at a time.
	import { onMount } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { connectInboxSocket } from '$lib/inboxSocket';
	import { cn } from '$lib/utils';
	import { ConversationList, InboxPlaceholder, NewConversationDialog } from '$features/inbox';

	let { data, children } = $props();

	onMount(() => connectInboxSocket());

	let newOpen = $state(false);
	afterNavigate(() => (newOpen = false));

	const chatId = $derived(page.params.chatId ?? null);
</script>

<div class="flex h-full min-h-0 flex-1 bg-background">
	<aside class={cn('min-h-0 w-full flex-col border-r bg-card lg:flex lg:w-[360px] lg:shrink-0', chatId ? 'hidden' : 'flex')}>
		<ConversationList conversations={data.conversations} userId={data.user?.id} activeId={chatId} onNew={() => (newOpen = true)} />
	</aside>
	<section class={cn('min-h-0 min-w-0 flex-1 flex-col', chatId ? 'flex' : 'hidden lg:flex')} aria-label="Conversation">
		{#if chatId}
			{@render children()}
		{:else}
			<InboxPlaceholder onNew={() => (newOpen = true)} />
		{/if}
	</section>
</div>

<NewConversationDialog bind:open={newOpen} people={data.availableUsers ?? []} userId={data.user?.id} form={data.newConversationForm} />
