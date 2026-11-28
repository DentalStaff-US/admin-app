<script lang="ts">
	/**
	 * A short form (≤ 6 fields, one purpose) in a Dialog (03 › Which overlay),
	 * posting to a form action. Closes itself on success.
	 */
	import type { Snippet } from 'svelte';
	import { enhance } from '$app/forms';
	import { Loader2 } from 'lucide-svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';

	let {
		open = $bindable(false),
		title,
		description,
		action,
		submitLabel,
		disabled = false,
		busy: externalBusy,
		formEnhance,
		children
	}: {
		open?: boolean;
		title: string;
		description?: string;
		action: string;
		submitLabel: string;
		disabled?: boolean;
		/** When `formEnhance` manages submission (superForms), its busy flag. */
		busy?: boolean;
		/** Replaces SvelteKit's enhance, e.g. a superForm's `enhance`. */
		formEnhance?: (node: HTMLFormElement) => unknown;
		children: Snippet;
	} = $props();

	let ownBusy = $state(false);
	const busy = $derived(externalBusy ?? ownBusy);

	function enhanced(form: HTMLFormElement) {
		if (formEnhance) return formEnhance(form) as { destroy?: () => void };
		return enhance(form, () => {
			ownBusy = true;
			return async ({ result, update }) => {
				ownBusy = false;
				if (result.type === 'success') open = false;
				await update();
			};
		});
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-lg sm:rounded-2xl">
		<form method="POST" {action} use:enhanced class="grid gap-4">
			<Dialog.Header>
				<Dialog.Title class="text-h2">{title}</Dialog.Title>
				{#if description}<Dialog.Description>{description}</Dialog.Description>{/if}
			</Dialog.Header>
			{@render children()}
			<Dialog.Footer class="gap-2">
				<Button type="button" variant="outline" class="min-h-11 sm:min-h-10" on:click={() => (open = false)} disabled={busy}>Cancel</Button>
				<Button type="submit" class="min-h-11 sm:min-h-10" disabled={busy || disabled}>
					{#if busy}<Loader2 class="mr-2 size-4 animate-spin" aria-hidden="true" />{/if}
					{submitLabel}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
