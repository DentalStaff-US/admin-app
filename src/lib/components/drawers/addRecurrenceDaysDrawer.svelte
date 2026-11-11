<script lang="ts">
	// Deprecated: moved to $features/requisitions (RecurrenceDaysSheet). Kept as a
	// pass-through until the last import is switched; delete afterwards.
	import RecurrenceDaysSheet from '$lib/features/requisitions/components/RecurrenceDaysSheet.svelte';
</script>

<RecurrenceDaysSheet {...($$props as any)} />
