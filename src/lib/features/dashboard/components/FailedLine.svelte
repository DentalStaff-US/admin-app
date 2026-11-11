<script lang="ts">
	// A section whose query failed: never hidden, never 0 (10 §3.7, §5 rule 5).
	import { AlertTriangle } from 'lucide-svelte';

	let { what }: { what: string } = $props();
</script>

<p role="status" class="flex items-center gap-2 rounded-md border border-status-warning-border bg-status-warning-bg px-3 py-2 text-sm text-status-warning-fg">
	<AlertTriangle class="size-4 shrink-0" aria-hidden="true" />
	Couldn't load {what}. Refresh to try again.
</p>
