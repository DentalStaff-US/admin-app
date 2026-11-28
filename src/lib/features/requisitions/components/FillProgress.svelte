<script lang="ts">
	let { filled, total }: { filled: number; total: number } = $props();
	const percent = $derived(total === 0 ? 0 : Math.round((filled / total) * 100));
</script>

<!-- "3/5 days filled" with a thin bar (06 › Requests list). -->
{#if total === 0}
	<span class="text-sm text-muted-foreground">No days yet</span>
{:else}
	<div class="min-w-28">
		<p class="text-sm tabular-nums">
			<span class="font-semibold">{filled}/{total}</span> <span class="text-muted-foreground">days filled</span>
		</p>
		<div
			class="mt-1 h-1.5 rounded-full bg-muted"
			role="progressbar"
			aria-label="Days filled"
			aria-valuemin={0}
			aria-valuemax={total}
			aria-valuenow={filled}
		>
			<div
				class={percent === 100 ? 'h-1.5 rounded-full bg-status-positive-solid' : 'h-1.5 rounded-full bg-primary'}
				style={`width: ${percent}%`}
			></div>
		</div>
	</div>
{/if}
