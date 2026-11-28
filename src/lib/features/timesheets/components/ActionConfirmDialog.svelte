<script lang="ts">
	/**
	 * A ConfirmDialog (03 › ConfirmDialog) that owns its form: it posts to a
	 * form action, optionally with a reason and other fields. The shared
	 * $dtss/ConfirmDialog has no body slot, so the reason-bearing confirmations
	 * (report a problem, void, reject an expense, reverse a payment) live here.
	 * Hard deletes still use $dtss/ConfirmDialog with confirmText="DELETE".
	 */
	import type { Snippet } from 'svelte';
	import type { ActionResult } from '@sveltejs/kit';
	import { enhance } from '$app/forms';
	import { Loader2 } from 'lucide-svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';

	let {
		open = $bindable(false),
		title,
		description,
		action,
		confirmLabel,
		tone = 'default',
		hidden = {},
		reason,
		fields,
		native = false,
		disabled = false,
		onSuccess
	}: {
		open?: boolean;
		title: string;
		/** Names the object and the consequence, not "Are you sure?". */
		description: string;
		/** Form action, e.g. "?/approveTimesheet". */
		action: string;
		confirmLabel: string;
		tone?: 'default' | 'success' | 'destructive';
		hidden?: Record<string, string | number>;
		/** A textarea posted as `name`. */
		reason?: { name: string; label: string; placeholder?: string; required?: boolean; maxLength?: number };
		/** Extra inputs above the reason. */
		fields?: Snippet;
		/** Post without `use:enhance` (a full navigation), as some flows always have. */
		native?: boolean;
		disabled?: boolean;
		onSuccess?: (result: ActionResult) => void;
	} = $props();

	let text = $state('');
	let busy = $state(false);
	const missing = $derived(!!reason?.required && !text.trim());

	$effect(() => {
		if (!open) text = '';
	});

	function enhanced(form: HTMLFormElement) {
		if (native) return {};
		return enhance(form, () => {
			busy = true;
			return async ({ result, update }) => {
				busy = false;
				if (result.type === 'success' || result.type === 'redirect') {
					open = false;
					onSuccess?.(result);
				}
				await update();
			};
		});
	}
</script>

<AlertDialog.Root bind:open>
	<AlertDialog.Content class="sm:rounded-2xl">
		<form method="POST" {action} use:enhanced class="grid gap-4">
			<AlertDialog.Header>
				<AlertDialog.Title class="text-h2">{title}</AlertDialog.Title>
				<AlertDialog.Description>{description}</AlertDialog.Description>
			</AlertDialog.Header>

			{#each Object.entries(hidden) as [name, value] (name)}
				<input type="hidden" {name} {value} />
			{/each}

			{#if fields}{@render fields()}{/if}

			{#if reason}
				<div class="space-y-2">
					<Label for="confirm-reason-{reason.name}">
						{reason.label}
						{#if !reason.required}<span class="font-normal text-muted-foreground">(optional)</span>{/if}
					</Label>
					<Textarea
						id="confirm-reason-{reason.name}"
						name={reason.name}
						bind:value={text}
						placeholder={reason.placeholder}
						rows={3}
						maxlength={reason.maxLength}
						required={reason.required}
					/>
				</div>
			{/if}

			<AlertDialog.Footer class="gap-2">
				<AlertDialog.Cancel class="min-h-11 sm:min-h-10" disabled={busy}>Go back</AlertDialog.Cancel>
				<Button
					type="submit"
					variant={tone === 'success' ? 'success' : tone === 'destructive' ? 'destructive' : 'default'}
					class="min-h-11 sm:min-h-10"
					disabled={busy || missing || disabled}
				>
					{#if busy}<Loader2 class="mr-2 size-4 animate-spin" aria-hidden="true" />{/if}
					{confirmLabel}
				</Button>
			</AlertDialog.Footer>
		</form>
	</AlertDialog.Content>
</AlertDialog.Root>
