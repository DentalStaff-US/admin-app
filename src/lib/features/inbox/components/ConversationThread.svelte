<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { onMount, tick } from 'svelte';
	import { superForm } from 'sveltekit-superforms/client';
	import { ArrowLeft, ExternalLink, Loader2, Send } from 'lucide-svelte';
	import Notice from '$dtss/Notice.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import { cn } from '$lib/utils';
	import ConversationAvatar from './ConversationAvatar.svelte';
	import { dayLabel, describeConversation, messageTime, otherParticipants, startsNewDay } from '../inbox';

	let { conversation, userId, form: formData }: { conversation: any; userId?: string; form: any } = $props();

	// Same submit behaviour as before: enhance, clear the box, follow to the bottom.
	// svelte-ignore state_referenced_locally
	const { enhance, submitting, form, errors, reset } = superForm(formData, {
		resetForm: true,
		clearOnSubmit: 'message',
		onResult: async ({ result }) => {
			if (result.type === 'success') {
				await tick();
				toBottom();
			}
			reset({ data: { body: '' } });
		}
	});

	const messages = $derived<any[]>(conversation?.messages ?? []);
	const about = $derived(describeConversation(conversation, userId));
	const others = $derived(otherParticipants(conversation, userId));
	const senderName = (id: string) => {
		const p = others.find((o) => o.userId === id);
		return p ? [p.firstName, p.lastName].filter(Boolean).join(' ') : 'Someone';
	};

	let list = $state<HTMLElement>();
	let composer = $state<HTMLFormElement>();
	let seen = 0;

	const nearBottom = () => !list || list.scrollHeight - list.scrollTop - list.clientHeight < 240;
	const toBottom = () => {
		if (list) list.scrollTop = list.scrollHeight;
	};

	// Loading a thread marks it read on the server, so the sidebar badge and the
	// list's unread dots are stale: refresh both (the shell load depends on app:unread).
	const markedRead = () => {
		invalidate('app:unread');
		invalidate('inbox:list');
	};

	onMount(() => {
		toBottom();
		seen = messages.length;
		markedRead();
	});

	// Follow new messages unless they've scrolled up to read something older.
	$effect(() => {
		const count = messages.length;
		if (count === seen) return;
		const follow = seen === 0 || nearBottom();
		seen = count;
		markedRead();
		if (follow) tick().then(toBottom);
	});

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
			event.preventDefault();
			if ($form.body?.trim()) composer?.requestSubmit();
		}
	}
</script>

<!-- Fills the pane: header at the top, only the messages scroll, composer pinned at the bottom. -->
<div class="flex h-full min-h-0 flex-col">
	<header class="z-10 flex shrink-0 items-center gap-3 border-b bg-card px-3 py-3 shadow-sm sm:px-4">
		<Button href="/inbox" variant="ghost" size="icon" class="size-10 shrink-0 lg:hidden" aria-label="Back to conversations">
			<ArrowLeft class="size-5" aria-hidden="true" />
		</Button>
		<ConversationAvatar initials={about.initials} avatarUrl={about.avatarUrl} group={about.group} />
		<div class="min-w-0 flex-1">
			<h2 class="truncate text-h3">{about.title}</h2>
			{#if about.subtitle}<p class="truncate text-sm text-muted-foreground">{about.subtitle}</p>{/if}
		</div>
		{#if about.contextHref}
			<Button href={about.contextHref} variant="outline" size="sm" class="shrink-0">
				<ExternalLink class="mr-2 size-4" aria-hidden="true" />View request
			</Button>
		{/if}
	</header>

	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<ol
		bind:this={list}
		tabindex="0"
		aria-label="Messages"
		aria-live="polite"
		class="relative flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain bg-muted/70 px-4 py-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
	>
		{#each messages as message, i (message.id)}
			{@const mine = message.senderId === userId}
			{#if startsNewDay(message, messages[i - 1])}
				<li class="my-2 flex items-center gap-3 text-xs font-bold text-muted-foreground">
					<span class="h-px flex-1 bg-border"></span>
					<span class="rounded-full border bg-card px-2.5 py-0.5">{dayLabel(message.createdAt)}</span>
					<span class="h-px flex-1 bg-border"></span>
				</li>
			{/if}
			{#if message.isSystemMessage}
				<li class="self-center rounded-full border bg-card px-3 py-1 text-center text-xs text-muted-foreground">{message.body}</li>
			{:else}
				<li class={cn('flex max-w-[85%] items-end gap-2 sm:max-w-md', mine ? 'self-end' : 'self-start')}>
					{#if !mine && about.group}
						{@const name = senderName(message.senderId)}
						<ConversationAvatar size="sm" initials={name.split(' ').map((p) => p[0]).join('').slice(0, 2)} avatarUrl={message.avatarUrl ?? null} />
					{/if}
					<div class={cn('flex min-w-0 flex-col', mine ? 'items-end' : 'items-start')}>
						<span class="sr-only">{mine ? 'You' : senderName(message.senderId)}:</span>
						{#if !mine && about.group}<span class="mb-0.5 text-xs font-semibold text-muted-foreground" aria-hidden="true">{senderName(message.senderId)}</span>{/if}
						<p
							class={cn(
								'whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm',
								mine ? 'rounded-br-sm bg-primary-strong text-primary-foreground' : 'rounded-bl-sm border bg-card'
							)}
						>{message.body}</p>
						<time class="mt-1 text-xs text-muted-foreground" datetime={new Date(message.createdAt).toISOString()}>{messageTime(message.createdAt)}</time>
					</div>
				</li>
			{/if}
		{:else}
			<li class="my-auto text-center text-sm text-muted-foreground">No messages yet. Say hello to {about.title}.</li>
		{/each}
	</ol>

	<form
		bind:this={composer}
		method="POST"
		action="?/sendNewMessage"
		use:enhance
		class="shrink-0 border-t bg-card p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
	>
		{#if $errors.body || $errors._errors}
			<div class="mb-2"><Notice tone="negative" alert>{[$errors.body, $errors._errors].flat().filter(Boolean).join(' ')}</Notice></div>
		{/if}
		<p id="composer-hint" class="sr-only">Enter sends; Shift+Enter adds a new line.</p>
		<div class="flex items-end gap-2">
			<Textarea
				name="body"
				aria-label="Message"
				rows={1}
				class="max-h-32 min-h-10 flex-1 resize-none"
				placeholder="Write a message"
				aria-describedby="composer-hint"
				bind:value={$form.body}
				on:keydown={onKeydown}
			/>
			<Button type="submit" size="icon" class="size-10 shrink-0" aria-label="Send message" disabled={$submitting || !$form.body?.trim()}>
				{#if $submitting}
					<Loader2 class="size-4 animate-spin" aria-hidden="true" />
				{:else}
					<Send class="size-4" aria-hidden="true" />
				{/if}
			</Button>
		</div>
	</form>
</div>
