<script lang="ts">
	// The page's one primary action as a split button (10 §3.5): New request, with
	// New professional · New client in the menu (they left the list cards).
	import { ChevronDown, Plus } from 'lucide-svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Button } from '$lib/components/ui/button';

	let {
		onrequest,
		onprofessional,
		onclient
	}: { onrequest: () => void; onprofessional: () => void; onclient: () => void } = $props();
</script>

<div class="inline-flex">
	<Button class="rounded-r-none" on:click={onrequest}><Plus class="mr-1.5 size-4" aria-hidden="true" />New requisition</Button>
	<DropdownMenu.Root>
		<DropdownMenu.Trigger
			aria-label="More ways to add"
			class="inline-flex h-10 items-center rounded-r-md border-l border-primary-foreground/30 bg-primary-strong px-2.5 text-primary-foreground shadow-card hover:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
		>
			<ChevronDown class="size-4" aria-hidden="true" />
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="end" class="w-48">
			<DropdownMenu.Item on:click={onprofessional}>New professional</DropdownMenu.Item>
			<DropdownMenu.Item on:click={onclient}>New client</DropdownMenu.Item>
		</DropdownMenu.Content>
	</DropdownMenu.Root>
</div>
