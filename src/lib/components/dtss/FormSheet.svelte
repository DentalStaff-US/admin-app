<script lang="ts">
	import { tick, type Snippet } from 'svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import * as Sheet from '$lib/components/ui/sheet';

	let {
		open = $bindable(false),
		title,
		description,
		dirty = false,
		children,
		footer
	}: {
		open?: boolean;
		title: string;
		description?: string;
		/** Unsaved changes: closing asks "Discard changes?" first (03 › Which overlay). */
		dirty?: boolean;
		children: Snippet;
		/** Sticky footer, usually Cancel + the submit button (form="…"). */
		footer?: Snippet;
	} = $props();

	let confirmDiscard = $state(false);

	// bits-ui 0.x reports a close after it happens and can't veto it. So with
	// unsaved changes Escape and outside clicks are switched off (and Escape
	// asks instead), and a close from the X button reopens and asks.
	async function onOpenChange(next: boolean) {
		if (!next && dirty) {
			open = false;
			await tick();
			open = true;
			confirmDiscard = true;
			return;
		}
		open = next;
	}

	function onKeydown(event: KeyboardEvent) {
		if (open && dirty && !confirmDiscard && event.key === 'Escape') confirmDiscard = true;
	}

	function discard() {
		confirmDiscard = false;
		open = false;
	}
</script>

<!-- 03 › Dialog & Sheet: long forms open in a right-hand drawer with a sticky
     header and footer; the body scrolls. Full width on phones. -->
<svelte:window onkeydown={onKeydown} />

<Sheet.Root {open} {onOpenChange} closeOnEscape={!dirty} closeOnOutsideClick={!dirty}>
	<Sheet.Content side="right" class="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
		<Sheet.Header class="shrink-0 border-b px-6 py-4 text-left">
			<Sheet.Title class="text-h2">{title}</Sheet.Title>
			{#if description}<Sheet.Description>{description}</Sheet.Description>{/if}
		</Sheet.Header>
		<div class="flex-1 overflow-y-auto px-6 py-5">{@render children()}</div>
		{#if footer}
			<div class="flex shrink-0 flex-col-reverse gap-3 border-t px-6 py-4 sm:flex-row sm:justify-end">
				{@render footer()}
			</div>
		{/if}
	</Sheet.Content>
</Sheet.Root>

<AlertDialog.Root bind:open={confirmDiscard}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Discard changes?</AlertDialog.Title>
			<AlertDialog.Description>Your edits haven't been saved.</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer class="gap-2">
			<AlertDialog.Cancel>Keep editing</AlertDialog.Cancel>
			<AlertDialog.Action class="bg-destructive text-destructive-foreground hover:bg-destructive/90" on:click={discard}>
				Discard
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
