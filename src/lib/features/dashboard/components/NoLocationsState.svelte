<script lang="ts">
	// A scoped staff member with no locations sees this, not empty tables (10 §4.2 rule 6).
	import { MapPin } from 'lucide-svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import { Button } from '$lib/components/ui/button';

	let { ownerName, ownerEmail }: { ownerName: string | null; ownerEmail: string | null } = $props();
</script>

<EmptyState
	icon={MapPin}
	title="You're not assigned to a location yet"
	description="Ask {ownerName ?? 'your practice owner'} to add you to one. Shifts, timesheets and requisitions for it will show up here."
>
	{#if ownerEmail}
		<Button href="mailto:{ownerEmail}?subject={encodeURIComponent('Please add me to a location')}">Email {ownerName?.split(' ')[0] ?? 'the owner'}</Button>
	{/if}
</EmptyState>
