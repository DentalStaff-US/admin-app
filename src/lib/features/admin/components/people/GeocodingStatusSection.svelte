<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { MapPin, RefreshCw } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';
	import Section from '$dtss/Section.svelte';
	import StatusBadge from '$dtss/StatusBadge.svelte';
	import { Button } from '$lib/components/ui/button';

	let {
		lastImportQueued = 0,
		refreshKey = 0,
		poll = true
	}: {
		/** Addresses queued by the most recent import on this page. */
		lastImportQueued?: number;
		/** Bump to re-check the queue (e.g. right after an import). */
		refreshKey?: number;
		/** Off in previews: there's no server to ask. */
		poll?: boolean;
	} = $props();

	let status = $state({ queueSize: 0, processing: false });
	let checking = $state(false);
	let interval: ReturnType<typeof setInterval> | undefined;

	const queueState = $derived(
		status.processing
			? { status: 'PROCESSING', label: 'Processing' }
			: status.queueSize > 0
				? { status: 'PENDING', label: 'Pending' }
				: { status: 'COMPLETED', label: 'Idle' }
	);

	async function check() {
		checking = true;
		try {
			const response = await fetch('?/getGeocodingStatus', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
			});
			if (!response.ok) {
				console.error('Status check failed:', response.statusText);
				return;
			}
			const data = await response.json();
			// Both the wrapped and direct response formats.
			if (data.type === 'success') {
				status = data.data || { queueSize: 0, processing: false };
			} else if (data.success !== undefined) {
				status = { queueSize: data.queueSize || 0, processing: data.processing || false };
			}
		} catch (error) {
			console.error('Error checking geocoding status:', error);
			status = { queueSize: 0, processing: false };
		} finally {
			checking = false;
		}
	}

	async function trigger(action: string, label: string) {
		try {
			const response = await fetch(`?/${action}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
			});
			if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			const data = await response.json();
			const result = data.type === 'success' ? data.data : data;
			if (result.success !== false) {
				toast.success(result.message || `Started: ${label}`);
				await check();
			} else {
				throw new Error(result.error || `Failed to start: ${label}`);
			}
		} catch (error) {
			console.error(`Error triggering ${action}:`, error);
			toast.error(`Couldn't start ${label.toLowerCase()}: ${error instanceof Error ? error.message : 'unknown error'}`);
		}
	}

	onMount(() => {
		if (!poll) return;
		check();
		interval = setInterval(() => {
			if (status.processing || status.queueSize > 0) check();
		}, 10000);
	});
	onDestroy(() => interval && clearInterval(interval));

	// Re-check shortly after an import queues new addresses.
	$effect(() => {
		if (refreshKey > 0 && poll) setTimeout(check, 1000);
	});
</script>

<Section title="Geocoding" description="Imported addresses are geocoded in the background so radius matching works.">
	{#snippet actions()}
		<Button variant="outline" size="sm" on:click={check} disabled={checking || !poll}>
			<RefreshCw class="mr-2 size-4 {checking ? 'animate-spin' : ''}" aria-hidden="true" /> Refresh
		</Button>
	{/snippet}
	<dl class="grid grid-cols-1 gap-3 sm:grid-cols-3">
		<div class="rounded-lg bg-muted p-3">
			<dt class="text-overline uppercase text-muted-foreground">Queue</dt>
			<dd class="mt-1 text-xl font-bold tabular-nums">{status.queueSize ?? '—'}</dd>
		</div>
		<div class="rounded-lg bg-muted p-3">
			<dt class="text-overline uppercase text-muted-foreground">Status</dt>
			<dd class="mt-1"><StatusBadge status={queueState.status} label={queueState.label} /></dd>
		</div>
		<div class="rounded-lg bg-muted p-3">
			<dt class="text-overline uppercase text-muted-foreground">Last import</dt>
			<dd class="mt-1 text-xl font-bold tabular-nums">{lastImportQueued} queued</dd>
		</div>
	</dl>
	<div class="mt-4 flex flex-wrap gap-2">
		<Button size="sm" on:click={() => trigger('geocodeAllPending', 'Geocode all pending')}>
			<MapPin class="mr-2 size-4" aria-hidden="true" /> Geocode all pending
		</Button>
		<Button size="sm" variant="outline" on:click={() => trigger('geocodePendingLocations', 'Geocode locations')}>Locations only</Button>
		<Button size="sm" variant="outline" on:click={() => trigger('geocodePendingCandidates', 'Geocode professionals')}>Professionals only</Button>
	</div>
</Section>
