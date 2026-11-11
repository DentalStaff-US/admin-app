<script lang="ts">
	import { enhance } from '$app/forms';
	import { ChevronDown } from 'lucide-svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import ConfirmDialog from '$dtss/ConfirmDialog.svelte';
	import { cn } from '$lib/utils';
	import {
		PROFILE_STATUSES,
		profileStatusLabel,
		statusChangeCopy,
		type ProfileStatus
	} from '../people';

	/**
	 * "Change status" menu for a professional or practice. Each choice goes
	 * through a ConfirmDialog that names the person and what changes, then
	 * posts `status` to the page's existing `updateStatus` action (replaces the
	 * Select that submitted on change with no confirmation).
	 */
	let {
		kind,
		name,
		status,
		action = '?/updateStatus'
	}: {
		kind: 'professional' | 'client';
		name: string;
		status: string | null | undefined;
		action?: string;
	} = $props();

	let open = $state(false);
	let next = $state<ProfileStatus>('ACTIVE');
	let submitting = $state(false);
	const copy = $derived(statusChangeCopy(kind, name, next));

	function choose(value: ProfileStatus) {
		next = value;
		open = true;
	}
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger class={cn(buttonVariants({ variant: 'outline' }), 'gap-1')}>
		Change status
		<ChevronDown class="size-4" aria-hidden="true" />
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end" class="w-48">
		{#each PROFILE_STATUSES as value (value)}
			<DropdownMenu.Item disabled={value === status} on:click={() => choose(value)}>
				{profileStatusLabel(value)}
				{#if value === status}<span class="ml-auto text-xs text-muted-foreground">Current</span>{/if}
			</DropdownMenu.Item>
		{/each}
	</DropdownMenu.Content>
</DropdownMenu.Root>

<ConfirmDialog bind:open title={copy.title} description={copy.description}>
	{#snippet confirm()}
		<form
			method="POST"
			{action}
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					await update();
					submitting = false;
					open = false;
				};
			}}
		>
			<input type="hidden" name="status" value={next} />
			<Button
				type="submit"
				variant={copy.tone === 'destructive' ? 'destructive' : copy.tone === 'success' ? 'success' : 'default'}
				class="min-h-11 w-full sm:min-h-10 sm:w-auto"
				disabled={submitting}
			>
				{submitting ? 'Saving…' : copy.confirmLabel}
			</Button>
		</form>
	{/snippet}
</ConfirmDialog>
