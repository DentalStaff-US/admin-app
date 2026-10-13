<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Lock, MessageSquare, Trash2 } from 'lucide-svelte';
	import { format, formatDistanceToNow } from 'date-fns';
	import { APP_NAME, USER_ROLES } from '$lib/config/constants';

	export let comments: {
		id: string;
		body: string;
		internal: boolean;
		createdAt: Date;
		authorId: string;
		authorFirstName: string | null;
		authorLastName: string | null;
		authorRole: string | null;
	}[] = [];
	export let currentUserId: string;
	export let isAdmin = false;
	/** Shown as the author chip for client-side commenters. */
	export let companyName: string | null = null;
	export let addAction = '?/addComment';
	export let deleteAction = '?/deleteComment';

	const MAX_LENGTH = 5000;

	let submitting = false;
	let commentBody = '';
	let internal = false;

	function initials(c: (typeof comments)[number]) {
		return `${c.authorFirstName?.[0] ?? ''}${c.authorLastName?.[0] ?? ''}` || '?';
	}

	function canDelete(c: (typeof comments)[number]) {
		return isAdmin || c.authorId === currentUserId;
	}
</script>

<div class="space-y-4">
	{#if comments.length === 0}
		<div class="text-center py-8">
			<MessageSquare class="h-10 w-10 mx-auto text-gray-300 mb-2" />
			<p class="text-sm text-gray-500">No comments yet</p>
			<p class="text-xs text-gray-400 mt-1">
				{isAdmin
					? 'Comments are visible to the client unless marked internal.'
					: `Use comments to ask the ${APP_NAME} team about this placement.`}
			</p>
		</div>
	{:else}
		<div class="space-y-3">
			{#each comments as comment (comment.id)}
				{@const fromAdmin = comment.authorRole === USER_ROLES.SUPERADMIN}
				<div
					class="rounded-lg p-4 flex gap-3 {comment.internal
						? 'bg-amber-50 border border-amber-200'
						: 'bg-gray-50'}"
				>
					<div
						class="h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 {fromAdmin
							? 'bg-blue-100 text-blue-800'
							: 'bg-emerald-100 text-emerald-800'}"
					>
						{initials(comment)}
					</div>
					<div class="flex-1 min-w-0">
						<div class="flex items-center justify-between gap-2 flex-wrap">
							<div class="flex items-center gap-2 flex-wrap">
								<p class="text-sm font-medium text-gray-900">
									{comment.authorFirstName ?? ''}
									{comment.authorLastName ?? ''}
								</p>
								<span
									class="text-[11px] rounded-full px-2 py-0.5 {fromAdmin
										? 'bg-blue-50 text-blue-700'
										: 'bg-emerald-50 text-emerald-700'}"
								>
									{fromAdmin ? APP_NAME : (companyName ?? 'Client')}
								</span>
								{#if comment.internal}
									<span
										class="inline-flex items-center gap-1 text-[11px] rounded-full px-2 py-0.5 bg-amber-100 text-amber-800"
									>
										<Lock class="h-3 w-3" /> Internal
									</span>
								{/if}
							</div>
							<div class="flex items-center gap-2">
								<p
									class="text-xs text-gray-400"
									title={format(new Date(comment.createdAt), 'PPp')}
								>
									{formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
								</p>
								{#if canDelete(comment)}
									<form
										method="POST"
										action={deleteAction}
										use:enhance={({ cancel }) => {
											if (!confirm('Delete this comment?')) cancel();
										}}
									>
										<input type="hidden" name="commentId" value={comment.id} />
										<button
											type="submit"
											class="text-gray-400 hover:text-red-500 transition-colors"
											aria-label="Delete comment"
										>
											<Trash2 class="h-3.5 w-3.5" />
										</button>
									</form>
								{/if}
							</div>
						</div>
						<p class="text-sm text-gray-700 mt-1 whitespace-pre-wrap break-words">
							{comment.body}
						</p>
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<form
		method="POST"
		action={addAction}
		use:enhance={() => {
			submitting = true;
			return async ({ result, update }) => {
				submitting = false;
				if (result.type === 'success') {
					commentBody = '';
					internal = false;
				}
				await update({ reset: false });
			};
		}}
		class="flex flex-col gap-2"
	>
		<Textarea
			name="body"
			bind:value={commentBody}
			maxlength={MAX_LENGTH}
			placeholder={isAdmin ? 'Add a comment for the client…' : 'Add a comment for our team…'}
			class="text-sm min-h-[80px] resize-y"
		/>
		<div class="flex items-center justify-between gap-2 flex-wrap">
			{#if isAdmin}
				<label class="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
					<input
						type="checkbox"
						name="internal"
						value="true"
						bind:checked={internal}
						class="rounded border-gray-300"
					/>
					Internal note (hidden from client)
				</label>
			{:else}
				<span></span>
			{/if}
			<Button
				type="submit"
				size="sm"
				class={internal ? 'bg-amber-600 hover:bg-amber-700' : 'bg-primary hover:bg-primary/90'}
				disabled={submitting || !commentBody.trim()}
			>
				{submitting ? 'Posting…' : internal ? 'Add internal note' : 'Add comment'}
			</Button>
		</div>
	</form>
</div>
