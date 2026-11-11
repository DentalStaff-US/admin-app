<script lang="ts">
	import type { Snippet } from 'svelte';

	// 03 › Card, one per onboarding step: fields in the body, the step's actions
	// in the footer (primary on the right; it stacks first on phones).
	let { children, footer }: { children: Snippet; footer?: Snippet } = $props();
</script>

<div class="rounded-lg border bg-card text-card-foreground shadow-card">
	<div class="space-y-5 p-5 sm:p-6">{@render children()}</div>
	{#if footer}
		<div class="flex flex-col-reverse gap-3 border-t px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
			{@render footer()}
		</div>
	{/if}
</div>
