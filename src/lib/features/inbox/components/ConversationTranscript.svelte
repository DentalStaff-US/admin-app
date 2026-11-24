<script lang="ts">
	import { format } from 'date-fns';
	import { ChevronLeft } from 'lucide-svelte';
	import Page from '$dtss/Page.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';
	import Section from '$dtss/Section.svelte';
	import { roleLabel } from '$features/admin';
	import { Button } from '$lib/components/ui/button';
	import type { ConversationReview } from '$lib/server/inbox/conversationLog';
	import ConversationAvatar from './ConversationAvatar.svelte';
	import { dayLabel, initialsOf, messageTime, startsNewDay } from '../inbox';

	/** A read-only transcript for DTSS review: no composer, and nothing is marked read. */
	let { conversation, back }: { conversation: ConversationReview; back: string } = $props();

	const roleOf = $derived(new Map(conversation.participants.map((p) => [p.userId, p.role])));
	const about = $derived([conversation.disciplineName, conversation.practiceName].filter(Boolean).join(' · '));
</script>

<Page width="narrow">
	<a href={back} class="inline-flex items-center gap-1 rounded-md text-sm font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
		<ChevronLeft class="size-4" aria-hidden="true" /> Conversation log
	</a>
	<PageHeader
		title={conversation.participants.map((p) => p.name).join(', ')}
		description={[about, `Started ${format(new Date(conversation.createdAt), 'PP')}`].filter(Boolean).join(' · ')}
	>
		{#snippet actions()}
			{#if conversation.requisitionId}
				<Button variant="outline" href="/requisitions/{conversation.requisitionId}">View requisition</Button>
			{/if}
		{/snippet}
	</PageHeader>

	<Section title="Participants" flush>
		<ul class="divide-y">
			{#each conversation.participants as p (p.userId)}
				<li class="flex items-center gap-3 px-5 py-3 sm:px-6">
					<ConversationAvatar size="sm" initials={initialsOf(p.name)} avatarUrl={p.avatarUrl} />
					<div class="min-w-0">
						<a href="/admin/menu/users/{p.userId}" class="font-semibold text-primary-dark hover:underline">{p.name}</a>
						<p class="break-all text-sm text-muted-foreground">{roleLabel(p.role)} · {p.email}</p>
					</div>
				</li>
			{/each}
		</ul>
	</Section>

	<Section title="Messages" description="Read-only. Viewing doesn't mark anything as read.">
		<ol class="space-y-4">
			{#each conversation.messages as message, i (message.id)}
				{#if startsNewDay(message, conversation.messages[i - 1])}
					<li class="flex items-center gap-3 text-xs font-bold text-muted-foreground">
						<span class="h-px flex-1 bg-border"></span>{dayLabel(message.createdAt)}<span class="h-px flex-1 bg-border"></span>
					</li>
				{/if}
				{#if message.isSystemMessage}
					<li class="text-center text-xs text-muted-foreground">{message.body}</li>
				{:else}
					<li class="flex gap-3">
						<ConversationAvatar size="sm" initials={initialsOf(message.senderName)} avatarUrl={message.avatarUrl} />
						<div class="min-w-0 flex-1">
							<p class="text-sm">
								<span class="font-bold">{message.senderName || 'Unknown'}</span>
								<span class="text-muted-foreground">
									{roleLabel(roleOf.get(message.senderId))} ·
									<time datetime={new Date(message.createdAt).toISOString()}>{messageTime(message.createdAt)}</time>{message.editedAt ? ' · edited' : ''}
								</span>
							</p>
							<p class="mt-0.5 whitespace-pre-wrap break-words text-sm">{message.body}</p>
						</div>
					</li>
				{/if}
			{:else}
				<li class="text-sm text-muted-foreground">No messages in this conversation.</li>
			{/each}
		</ol>
	</Section>
</Page>
