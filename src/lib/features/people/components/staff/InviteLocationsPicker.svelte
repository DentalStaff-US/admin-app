<script lang="ts">
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import { cn } from '$lib/utils';
	import { ALL_LOCATIONS } from '../../inviteLocations';

	/**
	 * Which locations a staff invite grants: all of them, or a choice. Posts
	 * `locationIds` (ALL_LOCATIONS or a JSON array) and `primaryLocationId`.
	 */
	let {
		locations,
		valid = $bindable(false)
	}: { locations: { id: string; name: string | null }[]; valid?: boolean } = $props();

	let mode = $state<'all' | 'some'>('all');
	let chosen = $state<string[]>([]);
	let primary = $state('');

	const granted = $derived(mode === 'all' ? locations : locations.filter((l) => chosen.includes(l.id)));
	const primaryId = $derived(granted.some((l) => l.id === primary) ? primary : (granted[0]?.id ?? ''));
	const nameOf = (l: { name: string | null } | undefined) => l?.name || 'Unnamed location';
	const posted = $derived(mode === 'all' ? ALL_LOCATIONS : JSON.stringify(chosen));

	$effect(() => {
		valid = granted.length > 0;
	});

	const toggle = (id: string, on: boolean) => (chosen = on ? [...chosen, id] : chosen.filter((c) => c !== id));
	const MODES = [
		{ value: 'all', label: 'All locations' },
		{ value: 'some', label: 'Choose locations' }
	] as const;
</script>

<fieldset class="space-y-3">
	<legend class="text-sm font-semibold">Location access</legend>
	<input type="hidden" name="locationIds" value={posted} />
	<input type="hidden" name="primaryLocationId" value={primaryId} />

	{#if locations.length === 0}
		<p class="text-sm text-muted-foreground">Add a location before inviting staff.</p>
	{:else if locations.length === 1}
		<p class="text-sm">{nameOf(locations[0])}</p>
	{:else}
		<div class="grid grid-cols-2 gap-1 rounded-md bg-muted p-1" role="radiogroup" aria-label="Location access">
			{#each MODES as m (m.value)}
				<button
					type="button"
					role="radio"
					aria-checked={mode === m.value}
					class={cn(
						'h-9 rounded-sm px-3 text-sm font-semibold text-muted-foreground transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
						mode === m.value && 'bg-background text-foreground shadow-card'
					)}
					onclick={() => (mode = m.value)}
				>
					{m.label}
				</button>
			{/each}
		</div>

		{#if mode === 'some'}
			<ul class="max-h-48 divide-y overflow-y-auto rounded-lg border">
				{#each locations as l (l.id)}
					<li class="flex items-center gap-3 px-4 py-2.5">
						<Checkbox id="invite-loc-{l.id}" checked={chosen.includes(l.id)} onCheckedChange={(v) => toggle(l.id, v === true)} />
						<Label for="invite-loc-{l.id}" class="flex-1 font-normal">{nameOf(l)}</Label>
					</li>
				{/each}
			</ul>
		{/if}

		{#if granted.length > 1}
			<div class="space-y-1.5">
				<Label for="invite-primary">Primary location</Label>
				<Select.Root
					selected={{ value: primaryId, label: nameOf(locations.find((l) => l.id === primaryId)) }}
					onSelectedChange={(v) => (primary = v ? String(v.value) : '')}
				>
					<Select.Trigger id="invite-primary"><Select.Value /></Select.Trigger>
					<Select.Content class="max-h-60 overflow-y-auto">
						{#each granted as l (l.id)}<Select.Item value={l.id} label={nameOf(l)}>{nameOf(l)}</Select.Item>{/each}
					</Select.Content>
				</Select.Root>
			</div>
		{/if}
		<p class="text-caption text-muted-foreground">
			{mode === 'all' ? 'Every location you have today. ' : ''}You can change this later. Admins always see every location.
		</p>
	{/if}
</fieldset>
