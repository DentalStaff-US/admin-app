<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import { MessageSquare, Trash2 } from 'lucide-svelte';
	import { format } from 'date-fns';

	export let comments: {
		id: string;
		body: string;
		createdAt: Date;
		authorId: string;
		authorFirstName: string;
		authorLastName: string;
		authorAvatarUrl: string | null;
	}[] = [];
	export let currentUserId: string;
	export let addAction: string;
	export let deleteAction: string;

	let submitting = false;
	let commentBody = '';
</script>

<div class="space-y-4">
	<!-- Comment list -->
	{#if comments.length === 0}
		<div class="text-center py-8">
			<MessageSquare class="h-10 w-10 mx-auto text-gray-300 mb-2" />
			<p class="text-sm text-gray-500">No comments yet</p>
		</div>
	{:else}
		<div class="space-y-3">
			{#each comments as comment}
				<div class="bg-gray-50 rounded-lg p-4 flex gap-3">
					<div
						class="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-semibold text-blue-800 flex-shrink-0"
					>
						{comment.authorFirstName[0]}{comment.authorLastName[0]}
					</div>
					<div class="flex-1 min-w-0">
						<div class="flex items-center justify-between gap-2 flex-wrap">
							<p class="text-sm font-medium text-gray-900">
								{comment.authorFirstName}
								{comment.authorLastName}
							</p>
							<div class="flex items-center gap-2">
								<p class="text-xs text-gray-400">{format(new Date(comment.createdAt), 'PPp')}</p>
								{#if comment.authorId === currentUserId}
									<form method="POST" action={deleteAction} use:enhance>
										<input type="hidden" name="commentId" value={comment.id} />
										<button
											type="submit"
											class="text-gray-400 hover:text-red-500 transition-colors"
										>
											<Trash2 class="h-3.5 w-3.5" />
										</button>
									</form>
								{/if}
							</div>
						</div>
						<p class="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{comment.body}</p>
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Add comment form -->
	<form
		method="POST"
		action={addAction}
		use:enhance={() => {
			submitting = true;
			return async ({ result, update }) => {
				submitting = false;
				if (result.type === 'success') commentBody = '';
				await update();
			};
		}}
		class="flex flex-col gap-2"
	>
		<Textarea
			name="body"
			bind:value={commentBody}
			placeholder="Add a note..."
			class="text-sm min-h-[80px] resize-none"
		/>
		<div class="flex justify-end">
			<Button
				type="submit"
				size="sm"
				class="bg-primary hover:bg-primary/90"
				disabled={submitting || !commentBody.trim()}
			>
				{submitting ? 'Posting...' : 'Add comment'}
			</Button>
		</div>
	</form>
</div>
