<script lang="ts">
	import { Loader2, Lock, RotateCcw, Send } from 'lucide-svelte';
	import { format } from 'date-fns';
	import { superForm } from 'sveltekit-superforms/client';
	import { enhance } from '$app/forms';
	import ConfirmDialog from '$dtss/ConfirmDialog.svelte';
	import Hint from '$dtss/Hint.svelte';
	import Notice from '$dtss/Notice.svelte';
	import Page from '$dtss/Page.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';
	import Section from '$dtss/Section.svelte';
	import StatusBadge from '$dtss/StatusBadge.svelte';
	import * as Avatar from '$lib/components/ui/avatar';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import { cn } from '$lib/utils';
	import { firstError } from '$features/settings';
	import { fullName, initials, sortThread, supportRoleLabel, timeAgo } from '../support';

	type Person = { id?: string | null; firstName?: string | null; lastName?: string | null; email?: string | null; avatarUrl?: string | null; role?: string | null } | null;
	type Ticket = {
		details: {
			ticket: {
				id: string;
				ticketNumber?: number | null;
				title: string;
				status: string | null;
				createdAt: Date | string;
				updatedAt: Date | string;
				expectedResult?: string | null;
				actualResults?: string | null;
				stepsToReproduce?: string | null;
			};
			reportedBy: Person;
			closedBy: Person;
		};
		comments: { comment: { id: string; body: string; createdAt: Date | string; fromId?: string | null }; user: Person }[];
	};

	let { ticket, viewerId, isAdmin, commentForm }: { ticket: Ticket; viewerId: string; isAdmin: boolean; commentForm: any } = $props();

	// svelte-ignore state_referenced_locally
	const { form, errors, enhance: commentEnhance, submitting } = superForm(commentForm, { resetForm: true });

	let confirmClose = $state(false);

	const t = $derived(ticket.details.ticket);
	const closed = $derived(t.status === 'CLOSED');
	const thread = $derived(sortThread(ticket.comments ?? []));
	const reporter = $derived(ticket.details.reportedBy);
	const exact = (d: Date | string) => format(new Date(d), 'PPp');

	const report = $derived([
		{ label: 'What was expected', body: t.expectedResult, empty: 'Not provided' },
		{ label: 'What happened', body: t.actualResults, empty: 'Not provided' },
		{ label: 'Steps to see it', body: t.stepsToReproduce, empty: 'Not provided' }
	]);
</script>

{#snippet avatar(person: Person, size = 'size-10')}
	<Avatar.Root class={cn(size, 'shrink-0')}>
		{#if person?.avatarUrl}<Avatar.Image src={person.avatarUrl} alt="" />{/if}
		<Avatar.Fallback class="bg-gradient-to-br from-primary to-pro text-sm font-bold text-primary-foreground">{initials(person)}</Avatar.Fallback>
	</Avatar.Root>
{/snippet}

{#snippet meta(person: Person, at: Date | string)}
	<p class="flex flex-wrap items-baseline gap-x-2 text-sm">
		<span class="font-bold">{fullName(person)}</span>
		<span class="text-xs text-muted-foreground">{supportRoleLabel(person?.role)}</span>
		<Hint text={exact(at)} class="text-xs text-muted-foreground"><time datetime={new Date(at).toISOString()}>{timeAgo(at)}</time></Hint>
	</p>
{/snippet}

<Page>
	<div>
		<a href="/support" class="text-sm font-semibold text-muted-foreground hover:text-foreground hover:underline">Support</a>
		<div class="mt-2">
			<PageHeader title={t.title} description={`Ticket #${t.ticketNumber ?? ''} · opened ${exact(t.createdAt)}`}>
				{#snippet actions()}
					<span class="self-center"><StatusBadge status={t.status} /></span>
					{#if !closed}
						<Button variant="destructiveOutline" on:click={() => (confirmClose = true)}>Close ticket…</Button>
					{/if}
					{#if isAdmin && closed}
						<form action="?/reopenTicket" method="post" use:enhance>
							<Button variant="outline" type="submit"><RotateCcw class="mr-2 size-4" aria-hidden="true" /> Reopen</Button>
						</form>
					{/if}
				{/snippet}
			</PageHeader>
		</div>
	</div>

	<div class="grid gap-6 lg:grid-cols-3">
		<!-- The conversation: the report first, then replies, oldest at the top. -->
		<section aria-label="Conversation" class="space-y-4 lg:col-span-2">
			<article class="flex gap-3">
				{@render avatar(reporter)}
				<div class="min-w-0 flex-1 space-y-2">
					{@render meta(reporter, t.createdAt)}
					<div class="divide-y rounded-2xl rounded-tl-sm border bg-card shadow-card">
						{#each report as part (part.label)}
							<div class="px-4 py-3">
								<p class="text-overline uppercase text-muted-foreground">{part.label}</p>
								<p class={cn('mt-1 whitespace-pre-line text-sm', !part.body && 'text-muted-foreground')}>{part.body || part.empty}</p>
							</div>
						{/each}
					</div>
				</div>
			</article>

			{#each thread as item (item.comment.id)}
				{@const mine = item.user?.id === viewerId || item.comment.fromId === viewerId}
				<article class={cn('flex gap-3', mine && 'flex-row-reverse')}>
					{@render avatar(item.user)}
					<div class={cn('min-w-0 max-w-[85%] space-y-1', mine && 'items-end text-right')}>
						<div class={cn(mine && 'flex justify-end')}>{@render meta(item.user, item.comment.createdAt)}</div>
						<div
							class={cn(
								'whitespace-pre-line rounded-2xl px-4 py-3 text-left text-sm',
								mine ? 'rounded-tr-sm bg-primary-soft text-foreground' : 'rounded-tl-sm bg-muted'
							)}
						>
							{item.comment.body}
						</div>
					</div>
				</article>
			{/each}

			{#if closed}
				<Notice tone="info" title="This ticket is closed">
					{isAdmin ? 'Reopen it to reply.' : 'Open a new ticket if you need more help.'}
				</Notice>
			{:else}
				<form action="?/addComment" method="post" use:commentEnhance class="rounded-lg border bg-card p-4 shadow-card">
					<label for="reply" class="text-sm font-semibold">Reply</label>
					<Textarea id="reply" name="body" bind:value={$form.body} rows={3} placeholder="Write a reply…" class="mt-1.5" />
					{#if firstError($errors.body)}<p class="mt-1 text-sm text-destructive">{firstError($errors.body)}</p>{/if}
					<div class="mt-3 flex justify-end">
						<Button type="submit" disabled={$submitting || !$form.body?.trim()}>
							{#if $submitting}<Loader2 class="mr-2 size-4 animate-spin" aria-hidden="true" />Sending…{:else}<Send class="mr-2 size-4" aria-hidden="true" />Send reply{/if}
						</Button>
					</div>
				</form>
			{/if}
		</section>

		<aside class="space-y-6">
			<Section title="Opened by" flush>
				<div class="flex items-center gap-3 px-5 py-4 sm:px-6">
					{@render avatar(reporter, 'size-12')}
					<div class="min-w-0">
						<p class="font-semibold">{fullName(reporter)}</p>
						{#if reporter?.email}<p class="truncate text-sm text-muted-foreground">{reporter.email}</p>{/if}
						<p class="text-xs text-muted-foreground">{supportRoleLabel(reporter?.role)}</p>
					</div>
				</div>
			</Section>
			<Section title="Details" flush>
				<dl class="divide-y text-sm">
					<div class="flex justify-between gap-4 px-5 py-3 sm:px-6"><dt class="text-muted-foreground">Status</dt><dd><StatusBadge status={t.status} /></dd></div>
					<div class="flex justify-between gap-4 px-5 py-3 sm:px-6"><dt class="text-muted-foreground">Opened</dt><dd class="text-right font-semibold">{exact(t.createdAt)}</dd></div>
					<div class="flex justify-between gap-4 px-5 py-3 sm:px-6"><dt class="text-muted-foreground">Replies</dt><dd class="font-semibold tabular-nums">{thread.length}</dd></div>
					{#if closed && ticket.details.closedBy}
						<div class="flex justify-between gap-4 px-5 py-3 sm:px-6"><dt class="text-muted-foreground">Closed by</dt><dd class="text-right font-semibold">{fullName(ticket.details.closedBy)}</dd></div>
						<div class="flex justify-between gap-4 px-5 py-3 sm:px-6"><dt class="text-muted-foreground">Closed</dt><dd class="text-right font-semibold">{exact(t.updatedAt)}</dd></div>
					{/if}
				</dl>
			</Section>
		</aside>
	</div>
</Page>

<ConfirmDialog
	bind:open={confirmClose}
	title={`Close ticket #${t.ticketNumber ?? ''}?`}
	description={isAdmin
		? `“${t.title}” is marked closed and replies are turned off. You can reopen it later.`
		: `“${t.title}” is marked closed and replies are turned off. Only our team can reopen it; open a new ticket if you need more help.`}
	cancelLabel="Keep it open"
>
	{#snippet confirm()}
		<form
			action="?/closeTicket"
			method="post"
			use:enhance={() => {
				confirmClose = false;
				return async ({ update }) => update();
			}}
		>
			<Button type="submit" variant="destructive" class="min-h-11 w-full sm:min-h-10"><Lock class="mr-2 size-4" aria-hidden="true" /> Close ticket</Button>
		</form>
	{/snippet}
</ConfirmDialog>
