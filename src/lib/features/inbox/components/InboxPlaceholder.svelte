<script lang="ts">
	import { MessagesSquare } from 'lucide-svelte';
	import IconSquare from '$dtss/IconSquare.svelte';
	import { Button } from '$lib/components/ui/button';

	let { onNew }: { onNew: () => void } = $props();
</script>

<!-- The right pane before a conversation is picked (desktop only). -->
<div class="flex h-full flex-col items-center justify-center bg-muted/70 px-6 text-center">
	<IconSquare icon={MessagesSquare} />
	<h2 class="mt-4 text-h3">Pick a conversation</h2>
	<p class="mt-1 max-w-sm text-sm text-muted-foreground">Choose one from the list, or start a new one with a professional, a practice or the team.</p>
	<Button class="mt-6" on:click={onNew}>New message</Button>
</div>
