<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import ConfirmDialog from '$dtss/ConfirmDialog.svelte';
	import { cn } from '$lib/utils';

	/**
	 * A button that opens a ConfirmDialog and, on confirm, posts `fields` to a
	 * form action (03 › Which overlay). With `confirmText="DELETE"` the person
	 * types the word first and it's posted as `confirm`, which the action
	 * checks with `hasTypedConfirmation` before a hard delete.
	 */
	let {
		action,
		fields = {},
		title,
		description,
		confirmLabel,
		tone = 'destructive',
		confirmText,
		label,
		icon,
		iconOnly = false,
		variant = 'outline',
		size = 'sm',
		disabled = false,
		class: className,
		onDone
	}: {
		action: string;
		fields?: Record<string, string | number | null | undefined>;
		title: string;
		description: string;
		confirmLabel: string;
		tone?: 'destructive' | 'default' | 'success';
		confirmText?: string;
		/** Button text, and the accessible name when `iconOnly`. */
		label: string;
		icon?: any;
		iconOnly?: boolean;
		variant?: 'outline' | 'ghost' | 'destructiveOutline' | 'default' | 'secondary';
		size?: 'sm' | 'default' | 'icon';
		disabled?: boolean;
		class?: string;
		onDone?: (ok: boolean) => void | Promise<void>;
	} = $props();

	let open = $state(false);
	let submitting = $state(false);
</script>

<Button
	{variant}
	size={iconOnly ? 'icon' : size}
	class={cn('gap-2', iconOnly && 'size-9', className)}
	aria-label={iconOnly ? label : undefined}
	{disabled}
	on:click={() => (open = true)}
>
	{#if icon}{@const Icon = icon}<Icon class="size-4" aria-hidden="true" />{/if}
	{#if !iconOnly}{label}{/if}
</Button>

<ConfirmDialog bind:open {title} {description} {confirmText}>
	{#snippet confirm({ ready, typed })}
		<form
			method="POST"
			{action}
			use:enhance={() => {
				submitting = true;
				return async ({ result, update }) => {
					await update();
					submitting = false;
					open = false;
					await onDone?.(result.type === 'success');
				};
			}}
		>
			{#each Object.entries(fields) as [name, value] (name)}
				<input type="hidden" {name} value={value ?? ''} />
			{/each}
			{#if confirmText}<input type="hidden" name="confirm" value={typed} />{/if}
			<Button
				type="submit"
				variant={tone}
				class="min-h-11 w-full sm:min-h-10 sm:w-auto"
				disabled={!ready || submitting}
			>
				{submitting ? 'Working…' : confirmLabel}
			</Button>
		</form>
	{/snippet}
</ConfirmDialog>
