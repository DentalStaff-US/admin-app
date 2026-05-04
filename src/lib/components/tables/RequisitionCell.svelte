<script lang="ts">
	export let disciplineName: string | null | undefined = null;
	export let requisitionId: number | string | null | undefined = null;
</script>

<div class="flex items-baseline gap-2">
	<span class="font-medium">{disciplineName ?? 'N/A'}</span>
	{#if requisitionId !== null && requisitionId !== undefined}
		<span class="text-xs text-muted-foreground">#{requisitionId}</span>
	{/if}
</div>
