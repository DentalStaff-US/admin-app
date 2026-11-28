<script lang="ts">
	import { goto } from '$app/navigation';
	import { page as pageState } from '$app/state';
	import { format } from 'date-fns';
	import { MessagesSquare, Search, X } from 'lucide-svelte';
	import DataTable from '$dtss/DataTable.svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import type { DataColumn } from '$dtss/tableState';
	import { SelectField, roleLabel } from '$features/admin';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import {
		CONVERSATION_BETWEEN,
		CONVERSATION_LOG_PATH,
		conversationLogUrl,
		type ConversationLogFilters,
		type ConversationLogRow
	} from '../conversationLog';

	let {
		rows,
		total,
		page,
		pageSize,
		filters
	}: {
		rows: ConversationLogRow[];
		total: number;
		page: number;
		pageSize: number;
		/** The filters the current rows were loaded with (from the URL). */
		filters: ConversationLogFilters;
	} = $props();

	// Local copies so typing doesn't navigate on every key; Apply puts them in the URL.
	// svelte-ignore state_referenced_locally
	let draft = $state({ ...filters });
	$effect(() => {
		draft = { ...filters };
	});

	const applied = $derived(Boolean(filters.search || filters.between));
	const betweenOptions = [{ value: '', label: 'Everyone' }, ...CONVERSATION_BETWEEN];
	const names = (r: ConversationLogRow) => r.participants.map((p) => p.name).join(', ');
	// Carries the filters, so the transcript's back link returns to this view.
	const rowHref = (r: ConversationLogRow) =>
		`${CONVERSATION_LOG_PATH}/${r.id}?from=${encodeURIComponent(pageState.url.pathname + pageState.url.search)}`;

	const columns: DataColumn<ConversationLogRow>[] = [
		{ id: 'participants', header: 'Between', cell: between },
		{ id: 'about', header: 'About', value: (r) => [r.disciplineName, r.practiceName].filter(Boolean).join(' · ') || '—' },
		{ id: 'last', header: 'Last message', cell: last, class: 'max-w-md' },
		{ id: 'count', header: 'Messages', value: (r) => r.messageCount, numeric: true },
		{ id: 'when', header: 'Last activity', cell: when, class: 'whitespace-nowrap' }
	];

	function apply(event?: SubmitEvent) {
		event?.preventDefault();
		goto(conversationLogUrl(draft));
	}
</script>

{#snippet between(r: ConversationLogRow)}
	{#each r.participants as p (p.userId)}
		<span class="block font-semibold">{p.name} <span class="font-normal text-muted-foreground">({roleLabel(p.role)})</span></span>
	{/each}
{/snippet}

{#snippet last(r: ConversationLogRow)}
	{#if r.lastMessage}
		<p class="line-clamp-2 break-words"><span class="font-semibold">{r.lastMessage.senderName}:</span> {r.lastMessage.body}</p>
	{/if}
{/snippet}

{#snippet when(r: ConversationLogRow)}
	{@const at = new Date(r.lastMessage?.createdAt ?? r.updatedAt)}
	{format(at, 'PP')} <span class="text-muted-foreground">{format(at, 'p')}</span>
{/snippet}

{#snippet mobile(r: ConversationLogRow)}
	<p class="font-semibold">{names(r)}</p>
	{@render last(r)}
	<p class="mt-1 text-caption text-muted-foreground">{@render when(r)} · {r.messageCount} {r.messageCount === 1 ? 'message' : 'messages'}</p>
{/snippet}

{#snippet toolbar()}
	<form class="flex flex-wrap items-center gap-2" onsubmit={apply} role="search">
		<div class="relative w-full max-w-md">
			<Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
			<Input type="search" bind:value={draft.search} aria-label="Search conversations" placeholder="Name, email, practice or message text" class="pl-9" />
		</div>
		<SelectField id="conversation-between" bind:value={draft.between} options={betweenOptions} label="Conversations between" class="w-full sm:w-64" />
		<Button type="submit" variant="outline">Apply</Button>
		{#if applied}
			<Button variant="ghost" href={CONVERSATION_LOG_PATH}><X class="mr-2 size-4" aria-hidden="true" /> Clear</Button>
		{/if}
		<p class="ml-auto text-sm text-muted-foreground">{total} {total === 1 ? 'conversation' : 'conversations'}</p>
	</form>
{/snippet}

{#snippet empty()}
	{#if applied}
		<EmptyState icon={MessagesSquare} title="No conversations match" description="Try a different name, practice or phrase.">
			<Button variant="outline" href={CONVERSATION_LOG_PATH}>Clear filters</Button>
		</EmptyState>
	{:else}
		<EmptyState icon={MessagesSquare} title="No conversations yet" description="Threads appear here once practices and professionals start messaging." />
	{/if}
{/snippet}

<DataTable
	{rows}
	{columns}
	key={(r) => r.id}
	{rowHref}
	rowLabel={(r) => `Open the conversation between ${names(r)}`}
	caption="Conversations"
	pagination={{ page, pageSize, total, href: (p) => conversationLogUrl(filters, p) }}
	{toolbar}
	{empty}
	{mobile}
/>
