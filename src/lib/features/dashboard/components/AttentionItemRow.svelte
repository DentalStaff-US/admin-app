<script lang="ts">
	// One queue row (10 §3.1): the row is a link to the record, plus one explicit
	// action. Consequential inline actions go through ConfirmDialog.
	import { enhance } from '$app/forms';
	import { ExternalLink, MapPin } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';
	import ConfirmDialog from '$dtss/ConfirmDialog.svelte';
	import Hint from '$dtss/Hint.svelte';
	import { Button } from '$lib/components/ui/button';
	import { cn } from '$lib/utils';
	import { formatAbsolute, formatAge } from '../format';
	import type { AttentionItem } from '../types';
	import { TONE_BORDER } from './tones';

	let {
		item,
		showLocation = false,
		now = new Date(),
		onremove,
		onrestore
	}: {
		item: AttentionItem;
		showLocation?: boolean;
		now?: Date;
		/** Optimistic removal when an inline action is submitted. */
		onremove?: (id: string) => void;
		onrestore?: (id: string) => void;
	} = $props();

	let confirmOpen = $state(false);
	let pending = $state(false);
	let done = $state(false);

	const form = $derived(item.action.form);
	// Actions on other routes (compliance) report through the flash toast already.
	const ownAction = $derived(!!form?.action.startsWith('?/'));

	function submit() {
		pending = true;
		if (form?.confirm) onremove?.(item.id);
		return async ({ result, update }: { result: { type: string; data?: Record<string, unknown> }; update: (o?: { reset?: boolean }) => Promise<void> }) => {
			pending = false;
			confirmOpen = false;
			if (result.type === 'success') {
				done = true;
				if (ownAction) toast.success('Hours approved');
				await update({ reset: false });
			} else {
				onrestore?.(item.id);
				const message = (result.data?.error as string) ?? 'Something went wrong. Nothing was changed.';
				if (ownAction) toast.error(message);
				await update({ reset: false });
			}
		};
	}
</script>

{#snippet hiddenFields()}
	{#each Object.entries(form?.fields ?? {}) as [name, value] (name)}
		<input type="hidden" {name} {value} />
	{/each}
{/snippet}

<li class={cn('flex flex-col gap-3 border-l-4 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-5', TONE_BORDER[item.tone])}>
	<a
		href={item.href}
		target={item.action.external && item.href === item.action.href ? '_blank' : undefined}
		rel={item.action.external && item.href === item.action.href ? 'noopener noreferrer' : undefined}
		class="group min-w-0 flex-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
	>
		<p class="font-semibold group-hover:underline sm:truncate">{item.title}</p>
		<p class="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
			{#if showLocation && item.location}
				<span class="inline-flex items-center gap-1"><MapPin class="size-3.5" aria-hidden="true" />{item.location}</span>
				<span aria-hidden="true">·</span>
			{/if}
			<span>{item.detail}</span>
		</p>
	</a>

	<div class="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
		<span class="text-xs tabular-nums text-muted-foreground">
			<Hint text={`Since ${formatAbsolute(item.since)}`}>{formatAge(item.since, now)}</Hint>
		</span>
		{#if item.note}<span class="text-xs text-muted-foreground">{item.note}</span>{/if}
		{#if item.secondary}
			<Button variant="ghost" size="sm" href={item.secondary.href}>{item.secondary.label}</Button>
		{/if}

		{#if item.action.disabledReason}
			<Hint text={item.action.disabledReason}>
				<span class="inline-flex h-9 cursor-not-allowed items-center rounded-md border border-input px-3 text-sm font-medium text-muted-foreground opacity-70">{item.action.label}</span>
			</Hint>
		{:else if form?.confirm}
			{#if item.action.hint}
				<Hint text={item.action.hint}>
					<Button size="sm" variant="outline" on:click={() => (confirmOpen = true)} disabled={pending || done}>{item.action.label}</Button>
				</Hint>
			{:else}
				<Button size="sm" variant="outline" on:click={() => (confirmOpen = true)} disabled={pending || done}>{item.action.label}</Button>
			{/if}
		{:else if form}
			<form method="POST" action={form.action} use:enhance={submit}>
				{@render hiddenFields()}
				{#if item.action.hint}
					<Hint text={item.action.hint}>
						<Button type="submit" size="sm" variant="outline" disabled={pending || done}>{done ? 'Sent' : pending ? 'Sending…' : item.action.label}</Button>
					</Hint>
				{:else}
					<Button type="submit" size="sm" variant="outline" disabled={pending || done}>{done ? 'Sent' : pending ? 'Sending…' : item.action.label}</Button>
				{/if}
			</form>
		{:else if item.action.href}
			<Button
				size="sm"
				variant="outline"
				href={item.action.href}
				target={item.action.external ? '_blank' : undefined}
				rel={item.action.external ? 'noopener noreferrer' : undefined}
			>
				{item.action.label}
				{#if item.action.external}<ExternalLink class="ml-1.5 size-3.5" aria-hidden="true" />{/if}
			</Button>
		{/if}
	</div>
</li>

{#if form?.confirm}
	<ConfirmDialog bind:open={confirmOpen} title={form.confirm.title} description={form.confirm.description}>
		{#snippet confirm()}
			<form method="POST" action={form.action} use:enhance={submit}>
				{@render hiddenFields()}
				<Button type="submit" variant="success" disabled={pending}>{pending ? 'Approving…' : form.confirm!.confirmLabel}</Button>
			</form>
		{/snippet}
	</ConfirmDialog>
{/if}
