<script lang="ts">
	/**
	 * Adds a comment to the timesheet's history. Admins choose whether the
	 * practice sees it; a practice's own comments always go to both sides.
	 * Professionals never see either.
	 */
	import { enhance } from '$app/forms';
	import { Loader2 } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { COMMENT_MAX_LENGTH } from '../history';

	let { admin = false }: { admin?: boolean } = $props();

	let text = $state('');
	let visibility = $state<'SHARED' | 'INTERNAL'>('SHARED');
	let busy = $state(false);
</script>

<form
	method="POST"
	action="?/addComment"
	class="mb-6 space-y-3 border-b pb-6"
	use:enhance={() => {
		busy = true;
		return async ({ result, update }) => {
			busy = false;
			if (result.type === 'success') text = '';
			await update({ reset: false });
		};
	}}
>
	<div class="space-y-2">
		<Label for="timesheet-comment">Add a comment</Label>
		<Textarea id="timesheet-comment" name="comment" bind:value={text} rows={3} maxlength={COMMENT_MAX_LENGTH} required />
	</div>
	<div class="flex flex-wrap items-center justify-between gap-3">
		{#if admin}
			<fieldset class="flex flex-wrap gap-x-5 gap-y-2 text-sm">
				<legend class="sr-only">Who can see this comment</legend>
				<label class="flex min-h-11 items-center gap-2 sm:min-h-0">
					<input type="radio" name="visibility" value="SHARED" bind:group={visibility} class="size-4 text-primary" /> Share with the practice and email them
				</label>
				<label class="flex min-h-11 items-center gap-2 sm:min-h-0">
					<input type="radio" name="visibility" value="INTERNAL" bind:group={visibility} class="size-4 text-primary" /> DTSS only
				</label>
			</fieldset>
		{:else}
			<p class="text-sm text-muted-foreground">DTSS gets this by email. The professional doesn’t see it.</p>
		{/if}
		<Button type="submit" variant="outline" class="min-h-11 sm:min-h-10" disabled={busy || !text.trim()}>
			{#if busy}<Loader2 class="mr-2 size-4 animate-spin" aria-hidden="true" />{/if}
			Add comment
		</Button>
	</div>
</form>
