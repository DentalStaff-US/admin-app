<script lang="ts">
	import { enhance } from '$app/forms';
	import { format } from 'date-fns';
	import { MessageSquare, Trash2 } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import EmptyState from '$dtss/EmptyState.svelte';
	import ConfirmAction from './ConfirmAction.svelte';
	import PersonAvatar from './PersonAvatar.svelte';
	import { initialsOf } from '../people';

	type Comment = {
		id: string;
		body: string;
		createdAt: Date | string;
		authorId: string;
		authorFirstName: string;
		authorLastName: string;
		authorAvatarUrl: string | null;
	};

	/** Admin-only notes on a professional or practice (was adminProfileComments). */
	let {
		comments = [],
		currentUserId,
		addAction,
		deleteAction
	}: { comments: Comment[]; currentUserId: string; addAction: string; deleteAction: string } =
		$props();

	let body = $state('');
	let submitting = $state(false);
</script>

<div class="space-y-5">
	<form
		method="POST"
		action={addAction}
		class="space-y-2"
		use:enhance={() => {
			submitting = true;
			return async ({ result, update }) => {
				submitting = false;
				if (result.type === 'success') body = '';
				await update();
			};
		}}
	>
		<Label for="note-body">Add a note</Label>
		<Textarea id="note-body" name="body" bind:value={body} placeholder="Only DTSS admins can see notes." class="min-h-20" />
		<div class="flex justify-end">
			<Button type="submit" disabled={submitting || !body.trim()}>
				{submitting ? 'Posting…' : 'Add note'}
			</Button>
		</div>
	</form>

	{#if comments.length === 0}
		<EmptyState icon={MessageSquare} title="No notes yet" description="Notes you add are visible to DTSS admins only." />
	{:else}
		<ul class="divide-y rounded-lg border">
			{#each comments as comment (comment.id)}
				<li class="flex gap-3 p-4">
					<PersonAvatar
						name="{comment.authorFirstName} {comment.authorLastName}"
						src={comment.authorAvatarUrl}
						initials={initialsOf(comment.authorFirstName, comment.authorLastName)}
					/>
					<div class="min-w-0 flex-1">
						<div class="flex flex-wrap items-center justify-between gap-2">
							<p class="text-sm font-semibold">
								{comment.authorFirstName}
								{comment.authorLastName}
								<time class="ml-1 font-normal text-muted-foreground" datetime={new Date(comment.createdAt).toISOString()}>
									{format(new Date(comment.createdAt), 'PPp')}
								</time>
							</p>
							{#if comment.authorId === currentUserId}
								<ConfirmAction
									action={deleteAction}
									fields={{ commentId: comment.id }}
									title="Delete this note?"
									description="The note is removed for every admin. This can't be undone."
									confirmLabel="Delete note"
									confirmText="DELETE"
									label="Delete note"
									icon={Trash2}
									iconOnly
									variant="ghost"
								/>
							{/if}
						</div>
						<p class="mt-1 whitespace-pre-wrap text-sm">{comment.body}</p>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>
