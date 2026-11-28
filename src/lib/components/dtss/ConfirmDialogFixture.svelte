<script lang="ts">
	// Test fixture for ConfirmDialog's typed confirmation.
	import ConfirmDialog from './ConfirmDialog.svelte';

	let { confirmText }: { confirmText?: string } = $props();
	let open = $state(true);
</script>

<ConfirmDialog bind:open title="Delete this record?" description="This can't be undone." {confirmText}>
	{#snippet confirm({ ready, typed })}
		<form>
			<input type="hidden" name="confirm" value={typed} />
			<button type="submit" disabled={!ready}>Delete</button>
		</form>
	{/snippet}
</ConfirmDialog>
