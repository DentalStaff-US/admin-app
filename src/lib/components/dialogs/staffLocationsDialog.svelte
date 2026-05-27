<script lang="ts">
	// Manage which company locations a single staff member is assigned to, and
	// which of those is their primary. Used on:
	//   - admin client detail page (per staff row)
	//   - client settings staff tab (per staff row)
	//   - location detail page (per staff row inline)
	//
	// Posts the full final state (locationIds + primaryLocationId) to the
	// supplied form action; the server uses setStaffLocations() to authoritatively
	// replace existing assignments. No partial deltas, no "add/remove" actions —
	// the whole set goes over the wire.
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Loader2 } from 'lucide-svelte';
	import { enhance } from '$app/forms';

	export let open = false;
	export let action: string;
	export let staffId: string;
	export let staffName = 'this staff member';
	export let locations: Array<{ id: string; name: string | null }> = [];
	export let initialLocationIds: string[] = [];
	export let initialPrimaryLocationId: string | null = null;

	let selectedIds = new Set<string>(initialLocationIds);
	let primaryId: string | null = initialPrimaryLocationId;
	let submitting = false;

	// Re-seed local state whenever the dialog is opened (caller may have
	// updated initial values between opens, e.g. after invalidateAll).
	$: if (open) {
		selectedIds = new Set<string>(initialLocationIds);
		primaryId = initialPrimaryLocationId;
	}

	function toggle(locationId: string, checked: boolean) {
		const next = new Set(selectedIds);
		if (checked) {
			next.add(locationId);
			// If no primary set yet, default to first added.
			if (!primaryId) primaryId = locationId;
		} else {
			next.delete(locationId);
			if (primaryId === locationId) {
				// Demoted the primary — promote any remaining selection or null out.
				primaryId = next.size > 0 ? Array.from(next)[0] : null;
			}
		}
		selectedIds = next;
	}

	function setPrimary(locationId: string) {
		if (!selectedIds.has(locationId)) return;
		primaryId = locationId;
	}

	function onToggleChange(locationId: string, ev: Event) {
		const target = ev.target as HTMLInputElement | null;
		toggle(locationId, !!target?.checked);
	}

	$: hasChanges =
		new Set(initialLocationIds).size !== selectedIds.size ||
		[...selectedIds].some((id) => !initialLocationIds.includes(id)) ||
		primaryId !== initialPrimaryLocationId;
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-[520px]">
		<Dialog.Header>
			<Dialog.Title>Manage locations for {staffName}</Dialog.Title>
			<Dialog.Description>
				Pick every location this staff member should have access to. Exactly one location is the
				primary.
			</Dialog.Description>
		</Dialog.Header>

		<form
			method="POST"
			{action}
			use:enhance={({ formData }) => {
				submitting = true;
				formData.set('staffId', staffId);
				formData.set('locationIds', JSON.stringify([...selectedIds]));
				formData.set('primaryLocationId', primaryId ?? '');
				return async ({ result, update }) => {
					submitting = false;
					if (result.type === 'success') {
						open = false;
					}
					await update();
				};
			}}
			class="space-y-2"
		>
			{#if locations.length === 0}
				<p class="text-sm text-muted-foreground py-4">
					This company has no locations yet. Add a location first.
				</p>
			{:else}
				<div class="border rounded-md divide-y max-h-[320px] overflow-y-auto">
					{#each locations as loc}
						{@const isAssigned = selectedIds.has(loc.id)}
						<div class="flex items-center justify-between px-3 py-2 gap-3">
							<label class="flex items-center gap-2 flex-1 cursor-pointer text-sm">
								<input
									type="checkbox"
									class="h-4 w-4 rounded border-gray-300"
									checked={isAssigned}
									on:change={(e) => onToggleChange(loc.id, e)}
								/>
								<span>{loc.name ?? 'Unnamed location'}</span>
							</label>
							<label
								class="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer"
								class:opacity-40={!isAssigned}
							>
								<input
									type="radio"
									name="primary-location"
									checked={primaryId === loc.id}
									disabled={!isAssigned}
									on:change={() => setPrimary(loc.id)}
								/>
								Primary
							</label>
						</div>
					{/each}
				</div>

				{#if selectedIds.size > 0 && !primaryId}
					<p class="text-sm text-red-600">Select a primary location.</p>
				{/if}
				{#if selectedIds.size === 0}
					<p class="text-sm text-yellow-700">
						No locations selected — this staff member will see no requisitions, timesheets, or
						invoices until at least one location is assigned.
					</p>
				{/if}
			{/if}

			<Dialog.Footer class="pt-4">
				<Button type="button" variant="outline" on:click={() => (open = false)} disabled={submitting}>
					Cancel
				</Button>
				<Button
					type="submit"
					class="bg-blue-700 hover:bg-blue-800"
					disabled={submitting ||
						!hasChanges ||
						(selectedIds.size > 0 && !primaryId) ||
						locations.length === 0}
				>
					{#if submitting}
						<Loader2 class="h-4 w-4 mr-2 animate-spin" />
						Saving…
					{:else}
						Save
					{/if}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
