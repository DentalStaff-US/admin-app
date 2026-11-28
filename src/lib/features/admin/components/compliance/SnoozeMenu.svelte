<script lang="ts">
	// Legacy syntax on purpose: the trigger carries both the tooltip's and the
	// menu's bits-ui 0.x builders (let:builder).
	import { createEventDispatcher } from 'svelte';
	import { Tooltip } from 'bits-ui';
	import { ChevronDown } from 'lucide-svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Button } from '$lib/components/ui/button';
	import { SNOOZE_DAYS } from '$lib/config/compliance';

	/** Whose item this is, for the menu's accessible name. */
	export let subject: string;

	const dispatch = createEventDispatcher<{ pick: number }>();
</script>

<!-- 10 §3.6: the snooze lengths are offered inline; picking one asks to confirm. -->
<DropdownMenu.Root>
	<Tooltip.Root openDelay={1000} closeOnPointerDown>
		<Tooltip.Trigger asChild let:builder={tip}>
			<DropdownMenu.Trigger asChild let:builder={menu}>
				<Button builders={[tip, menu]} size="sm" variant="outline" aria-label="Snooze {subject}">
					Snooze <ChevronDown class="ml-1 size-3.5" aria-hidden="true" />
				</Button>
			</DropdownMenu.Trigger>
		</Tooltip.Trigger>
		<Tooltip.Content
			sideOffset={6}
			class="z-50 max-w-64 rounded-md bg-navy px-2.5 py-1.5 text-xs font-semibold leading-snug text-white shadow-float"
		>
			Hides it from the queue and the dashboard count until the date you pick.
		</Tooltip.Content>
	</Tooltip.Root>
	<DropdownMenu.Content align="end" class="w-40">
		<DropdownMenu.Label>Snooze for</DropdownMenu.Label>
		{#each SNOOZE_DAYS as days}
			<DropdownMenu.Item on:click={() => dispatch('pick', days)}>{days} days</DropdownMenu.Item>
		{/each}
	</DropdownMenu.Content>
</DropdownMenu.Root>
