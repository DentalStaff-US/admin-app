<script lang="ts">
	// Compliance severities aren't in the shared statusMap yet (10 W3), so their
	// tones are pinned here: CRITICAL/BLOCKED negative, ACTION warning, WATCH pending.
	import { TONE_CLASSES } from '$tokens/status';
	import { CalendarX } from 'lucide-svelte';
	import Hint from '$dtss/Hint.svelte';
	import { SEVERITY_LABELS } from '$lib/config/compliance';
	import { statusHint } from '../hints';
	import type { ComplianceSeverityKey } from '../types';

	let { severity }: { severity: ComplianceSeverityKey } = $props();

	const TONE = { CRITICAL: 'negative', BLOCKED: 'negative', ACTION: 'warning', WATCH: 'pending' } as const;
</script>

<Hint text={statusHint(severity, 'admin') ?? SEVERITY_LABELS[severity]} class="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold {TONE_CLASSES[TONE[severity]]}">
	{#if severity === 'CRITICAL'}<CalendarX class="size-3.5" aria-hidden="true" />{/if}
	{SEVERITY_LABELS[severity]}
</Hint>
