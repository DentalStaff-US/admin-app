<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { StatusTone } from '$tokens/status';
	import { cn } from '$lib/utils';

	export type TimelineEntry = {
		id: string | number;
		at: Date | string;
		/** Who did it, bolded before the text. */
		actor?: string | null;
		text?: string;
		/** What they wrote, quoted under the line. */
		note?: string | null;
		body?: Snippet;
		tone?: StatusTone;
	};

	let { entries, empty = 'No activity yet.' }: { entries: TimelineEntry[]; empty?: string } = $props();

	const DOT: Record<StatusTone, string> = {
		positive: 'bg-status-positive-solid',
		info: 'bg-status-info-solid',
		pending: 'bg-status-pending-solid',
		warning: 'bg-status-warning-solid',
		negative: 'bg-status-negative-solid',
		neutral: 'bg-status-neutral-solid'
	};

	const fmt = (at: Date | string) =>
		new Date(at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
</script>

<!-- 03 › Timeline: history, audit trail, comments. -->
{#if entries.length === 0}
	<p class="text-sm text-muted-foreground">{empty}</p>
{:else}
	<ol class="relative space-y-6 border-l pl-6">
		{#each entries as entry (entry.id)}
			<li class="relative">
				<span class={cn('absolute -left-[29px] mt-1.5 size-2.5 rounded-full ring-4 ring-background', DOT[entry.tone ?? 'neutral'])} aria-hidden="true"></span>
				<div class="text-sm">
					{#if entry.actor}<b class="font-bold">{entry.actor}</b>{' '}{/if}{#if entry.body}{@render entry.body()}{:else}{entry.text}{/if}
				</div>
				{#if entry.note}<p class="mt-1.5 whitespace-pre-wrap break-words rounded-md bg-muted px-3 py-2 text-sm">{entry.note}</p>{/if}
				<time class="text-caption text-muted-foreground" datetime={new Date(entry.at).toISOString()}>{fmt(entry.at)}</time>
			</li>
		{/each}
	</ol>
{/if}
