<script lang="ts">
	import { Briefcase } from 'lucide-svelte';
	import EmptyState from '$dtss/EmptyState.svelte';

	/**
	 * Placeholder for the professional's "Permanent" tab (06 › Permanent hiring:
	 * saves and applications across requests, each with its stage). The real
	 * tab is built elsewhere and wired in here; keep this slot free of logic.
	 */
	let { candidateId: _candidateId }: { candidateId?: string } = $props();
</script>

<EmptyState
	icon={Briefcase}
	title="Permanent applications will show here"
	description="Saved permanent jobs and applications across every request, each with its stage."
/>
