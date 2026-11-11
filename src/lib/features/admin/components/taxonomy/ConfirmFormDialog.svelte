<script lang="ts">
	import { enhance as kitEnhance } from '$app/forms';
	import ConfirmDialog from '$dtss/ConfirmDialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Loader2 } from 'lucide-svelte';

	type Enhance = (form: HTMLFormElement) => { destroy?: () => void } | void;

	let {
		open = $bindable(false),
		title,
		description,
		action,
		fields,
		confirmLabel,
		confirmText,
		destructive = true,
		enhance,
		submitting = false
	}: {
		open?: boolean;
		title: string;
		/** Names the record and the consequence, never "Are you sure?". */
		description: string;
		/** The form action, e.g. "?/deleteDiscipline". */
		action: string;
		/** Hidden fields the action reads (ids). */
		fields: Record<string, string>;
		confirmLabel: string;
		/** Hard deletes: "DELETE". Posted as `confirm`; the action checks hasTypedConfirmation. */
		confirmText?: string;
		destructive?: boolean;
		/** A superForm's `enhance`; by default SvelteKit's, closing on success. */
		enhance?: Enhance;
		/** The superForm's $submitting when `enhance` is passed. */
		submitting?: boolean;
	} = $props();

	let busy = $state(false);

	function defaultEnhance(form: HTMLFormElement) {
		return kitEnhance(form, () => {
			busy = true;
			return async ({ result, update }) => {
				busy = false;
				if (result.type === 'success' || result.type === 'redirect') open = false;
				await update();
			};
		});
	}

	const act: Enhance = enhance ?? defaultEnhance;
	const pending = $derived(busy || submitting);
</script>

<!-- ConfirmDialog + the form that carries out the action. Hard deletes pass
     confirmText="DELETE" (03 › Which overlay). -->
<ConfirmDialog bind:open {title} {description} {confirmText}>
	{#snippet confirm({ ready, typed })}
		<form method="POST" {action} use:act>
			{#each Object.entries(fields) as [name, value] (name)}
				<input type="hidden" {name} {value} />
			{/each}
			{#if confirmText}<input type="hidden" name="confirm" value={typed} />{/if}
			<Button
				type="submit"
				variant={destructive ? 'destructive' : 'default'}
				class="min-h-11 w-full sm:min-h-10 sm:w-auto"
				disabled={!ready || pending}
			>
				{#if pending}<Loader2 class="mr-2 size-4 animate-spin" aria-hidden="true" />{/if}
				{confirmLabel}
			</Button>
		</form>
	{/snippet}
</ConfirmDialog>
