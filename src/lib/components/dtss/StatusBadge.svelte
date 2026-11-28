<script lang="ts">
	import { statusLabel, statusTone, TONE_CLASSES } from '$tokens/status';
	import Hint from './Hint.svelte';

	let {
		status,
		label,
		hint
	}: { status: string | null | undefined; label?: string; hint?: string } = $props();

	const classes = $derived(
		`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold ${TONE_CLASSES[statusTone(status)]}`
	);
</script>

{#if hint}
	<Hint text={hint} class={classes}>{label ?? statusLabel(status)}</Hint>
{:else}
	<span class={classes}>{label ?? statusLabel(status)}</span>
{/if}
