<script lang="ts">
	import { enhance } from '$app/forms';
	import { ArrowDown, ArrowUp } from 'lucide-svelte';
	import IconAction from './IconAction.svelte';
	import { movedOrder } from './taxonomy';

	let {
		ids,
		id,
		name,
		disabled = false,
		action = '?/reorder'
	}: {
		/** The whole list's order; the action receives it with `id` moved one step. */
		ids: string[];
		id: string;
		name: string;
		/** e.g. while a search narrows the list, so the order posted would be partial. */
		disabled?: boolean;
		action?: string;
	} = $props();

	const index = $derived(ids.indexOf(id));
</script>

<div class="flex items-center">
	<form method="POST" {action} use:enhance>
		{#each movedOrder(ids, id, -1) as orderedId (orderedId)}<input type="hidden" name="orderedIds" value={orderedId} />{/each}
		<IconAction type="submit" label="Move {name} up" icon={ArrowUp} disabled={disabled || index <= 0} />
	</form>
	<form method="POST" {action} use:enhance>
		{#each movedOrder(ids, id, 1) as orderedId (orderedId)}<input type="hidden" name="orderedIds" value={orderedId} />{/each}
		<IconAction type="submit" label="Move {name} down" icon={ArrowDown} disabled={disabled || index === ids.length - 1} />
	</form>
</div>
