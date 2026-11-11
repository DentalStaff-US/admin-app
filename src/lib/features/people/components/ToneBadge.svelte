<script lang="ts">
	import { TONE_CLASSES, type StatusTone } from '$tokens/status';
	import Hint from '$dtss/Hint.svelte';

	/**
	 * StatusBadge's look for a value that isn't a database status (credential
	 * states, opt-outs): the caller supplies the tone and the sentence-case label.
	 */
	let { tone, label, hint }: { tone: StatusTone; label: string; hint?: string } = $props();
	const classes = $derived(
		`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold ${TONE_CLASSES[tone]}`
	);
</script>

{#if hint}
	<Hint text={hint} class={classes}>{label}</Hint>
{:else}
	<span class={classes}>{label}</span>
{/if}
