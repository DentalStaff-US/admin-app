<script lang="ts">
	import type { Snippet } from 'svelte';
	import { ChevronLeft } from 'lucide-svelte';
	import PersonAvatar from './PersonAvatar.svelte';

	/**
	 * PageHeader for a person or practice (03 › Page & PageHeader): avatar at
	 * size-14 left of the title, a meta row for status and key badges, actions
	 * that wrap under the title on phones. Built locally because the shared
	 * PageHeader has no avatar or meta slot. Scrolls with the page (no sticky).
	 */
	let {
		title,
		subtitle,
		avatar,
		back,
		meta,
		actions
	}: {
		title: string;
		subtitle?: string | null;
		avatar?: {
			src?: string | null;
			initials: string;
			kind?: 'person' | 'org';
			audience?: 'practice' | 'pro';
		};
		back?: { href: string; label: string };
		meta?: Snippet;
		actions?: Snippet;
	} = $props();
</script>

<header class="space-y-3">
	{#if back}
		<a
			href={back.href}
			class="inline-flex items-center gap-1 rounded-md text-sm font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			<ChevronLeft class="size-4" aria-hidden="true" />
			{back.label}
		</a>
	{/if}
	<div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
		<div class="flex min-w-0 items-start gap-4">
			{#if avatar}
				<PersonAvatar
					name={title}
					src={avatar.src}
					initials={avatar.initials}
					size="lg"
					kind={avatar.kind}
					audience={avatar.audience}
				/>
			{/if}
			<div class="min-w-0">
				<h1 class="text-h1 break-words">{title}</h1>
				{#if subtitle}<p class="mt-0.5 text-muted-foreground">{subtitle}</p>{/if}
				{#if meta}
					<div class="mt-2 flex flex-wrap items-center gap-2">{@render meta()}</div>
				{/if}
			</div>
		</div>
		{#if actions}
			<div class="flex flex-wrap items-center gap-2">{@render actions()}</div>
		{/if}
	</div>
</header>
