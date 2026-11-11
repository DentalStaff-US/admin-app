<script lang="ts">
	import { enhance } from '$app/forms';
	import { Lock, MessageSquare, Trash2 } from 'lucide-svelte';
	import { format, formatDistanceToNow } from 'date-fns';
	import ConfirmDialog from '$dtss/ConfirmDialog.svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import Hint from '$dtss/Hint.svelte';
	import Section from '$dtss/Section.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { APP_NAME, USER_ROLES } from '$lib/config/constants';
	import { cn } from '$lib/utils';

	type Comment = {
		id: string;
		body: string;
		internal: boolean;
		createdAt: Date | string;
		authorId: string;
		authorFirstName: string | null;
		authorLastName: string | null;
		authorRole: string | null;
	};

	let {
		comments = [],
		isAdmin = false,
		currentUserId,
		companyName = null
	}: {
		comments: Comment[];
		isAdmin?: boolean;
		currentUserId: string;
		/** Shown as the side label for practice commenters. */
		companyName?: string | null;
	} = $props();

	const MAX_LENGTH = 5000;
	let body = $state('');
	let internal = $state(false);
	let submitting = $state(false);

	// Deleting removes the comment for both sides with no undo: typed DELETE (03 › ConfirmDialog).
	let deleteOpen = $state(false);
	let deleting = $state<Comment | null>(null);
	let deleteSubmitting = $state(false);

	const author = (c: Comment) => `${c.authorFirstName ?? ''} ${c.authorLastName ?? ''}`.trim() || 'Someone';
	const fromDtss = (c: Comment) => c.authorRole === USER_ROLES.SUPERADMIN;
	const canDelete = (c: Comment) => isAdmin || c.authorId === currentUserId;
</script>

<Section
	title="Comments"
	description={isAdmin
		? 'Shared with the practice unless marked internal. New comments email the other side.'
		: 'A conversation with our team about this placement.'}
>
	<div class="space-y-6">
		{#if comments.length === 0}
			<EmptyState
				icon={MessageSquare}
				title="No comments yet"
				description={isAdmin
					? 'Comments are visible to the practice unless marked internal.'
					: `Use comments to ask the ${APP_NAME} team about this placement.`}
			/>
		{:else}
			<!-- 03 › Timeline recipe, with a delete control per entry. -->
			<ol class="relative space-y-6 border-l pl-6">
				{#each comments as c (c.id)}
					<li class="relative">
						<span
							class={cn(
								'absolute -left-[29px] mt-1.5 size-2.5 rounded-full ring-4 ring-background',
								c.internal ? 'bg-status-pending-solid' : fromDtss(c) ? 'bg-status-info-solid' : 'bg-status-neutral-solid'
							)}
							aria-hidden="true"
						></span>
						<div class="flex flex-wrap items-center gap-2 text-sm">
							<b class="font-bold">{author(c)}</b>
							<span class="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
								{fromDtss(c) ? APP_NAME : (companyName ?? 'Practice')}
							</span>
							{#if c.internal}
								<span class="inline-flex items-center gap-1 rounded-full border border-status-pending-border bg-status-pending-bg px-2 py-0.5 text-xs font-bold text-status-pending-fg">
									<Lock class="size-3" aria-hidden="true" /> Internal
								</span>
							{/if}
							{#if canDelete(c)}
								<Button
									variant="ghost"
									size="icon"
									class="ml-auto size-8 text-muted-foreground hover:text-destructive"
									aria-label={`Delete comment by ${author(c)}`}
									on:click={() => {
										deleting = c;
										deleteOpen = true;
									}}
								>
									<Trash2 class="size-4" aria-hidden="true" />
								</Button>
							{/if}
						</div>
						<p class="mt-1 whitespace-pre-wrap break-words text-sm">{c.body}</p>
						<Hint text={format(new Date(c.createdAt), 'PPp')} class="inline-block text-xs leading-5 text-muted-foreground">
							<time class="text-xs text-muted-foreground" datetime={new Date(c.createdAt).toISOString()}>
								{formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
							</time>
						</Hint>
					</li>
				{/each}
			</ol>
		{/if}

		<form
			method="POST"
			action="?/addComment"
			class="space-y-3 border-t pt-5"
			use:enhance={() => {
				submitting = true;
				return async ({ result, update }) => {
					submitting = false;
					if (result.type === 'success') {
						body = '';
						internal = false;
					}
					await update({ reset: false });
				};
			}}
		>
			<Label for="comment-body" class="font-semibold">Add a comment</Label>
			<Textarea
				id="comment-body"
				name="body"
				bind:value={body}
				maxlength={MAX_LENGTH}
				placeholder={isAdmin ? 'Write to the practice…' : 'Write to our team…'}
				class="min-h-20 resize-y"
			/>
			<div class="flex flex-wrap items-center justify-between gap-3">
				{#if isAdmin}
					<div class="flex items-center gap-2">
						<Checkbox id="comment-internal" checked={internal} onCheckedChange={(v) => (internal = v === true)} />
						<Label for="comment-internal" class="text-sm font-normal">Internal note (hidden from the practice)</Label>
						{#if internal}<input type="hidden" name="internal" value="true" />{/if}
					</div>
				{:else}
					<span></span>
				{/if}
				<Button type="submit" disabled={submitting || !body.trim()}>
					{submitting ? 'Posting…' : internal ? 'Add internal note' : 'Add comment'}
				</Button>
			</div>
		</form>
	</div>
</Section>

<ConfirmDialog
	bind:open={deleteOpen}
	title="Delete this comment?"
	description={deleting
		? `${author(deleting)}'s comment is removed for everyone, including the ${deleting.internal ? 'admin team' : 'practice'}. This can't be undone.`
		: "The comment is removed for everyone. This can't be undone."}
	confirmText="DELETE"
>
	{#snippet confirm({ ready, typed })}
		<form
			method="POST"
			action="?/deleteComment"
			use:enhance={() => {
				deleteSubmitting = true;
				return async ({ update }) => {
					deleteSubmitting = false;
					deleteOpen = false;
					deleting = null;
					await update();
				};
			}}
		>
			<input type="hidden" name="commentId" value={deleting?.id ?? ''} />
			<input type="hidden" name="confirm" value={typed} />
			<Button type="submit" variant="destructive" class="w-full sm:w-auto" disabled={!ready || deleteSubmitting}>
				{deleteSubmitting ? 'Deleting…' : 'Delete comment'}
			</Button>
		</form>
	{/snippet}
</ConfirmDialog>
