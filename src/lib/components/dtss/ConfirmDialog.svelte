<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';

	let {
		open = $bindable(false),
		title,
		description,
		cancelLabel = 'Go back',
		confirmText,
		confirm
	}: {
		open?: boolean;
		title: string;
		description: string;
		cancelLabel?: string;
		/**
		 * Hard deletes only (03 › ConfirmDialog): the person types this word
		 * (e.g. "DELETE") before the confirm button enables. The snippet gets
		 * `ready` to disable its button and `typed` to post as `confirm`, which
		 * the server action checks with `hasTypedConfirmation`.
		 */
		confirmText?: string;
		/** The confirming button, often inside a form. Cancel takes focus first. */
		confirm: Snippet<[{ ready: boolean; typed: string }]>;
	} = $props();

	let typed = $state('');
	const ready = $derived(!confirmText || typed.trim() === confirmText);

	// Start empty every time it opens.
	$effect(() => {
		if (!open) typed = '';
	});
</script>

<AlertDialog.Root bind:open>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{title}</AlertDialog.Title>
			<AlertDialog.Description>{description}</AlertDialog.Description>
		</AlertDialog.Header>
		{#if confirmText}
			<div class="space-y-2">
				<Label for="confirm-text">Type <span class="font-mono font-bold">{confirmText}</span> to continue</Label>
				<Input id="confirm-text" autocomplete="off" autocapitalize="characters" spellcheck="false" bind:value={typed} />
			</div>
		{/if}
		<AlertDialog.Footer class="gap-2">
			<AlertDialog.Cancel class="min-h-11 sm:min-h-10">{cancelLabel}</AlertDialog.Cancel>
			{@render confirm({ ready, typed: typed.trim() })}
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
