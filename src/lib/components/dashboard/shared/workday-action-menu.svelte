<script lang="ts">
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import ActionMenuButton from '$lib/components/dashboard/shared/action-menu-button.svelte';
	import { Eye, Trash2, XCircle } from 'lucide-svelte';

	/** Link to the workday detail page for this row. */
	export let href: string;
	export let canCancel = false;
	export let canDelete = false;
	/**
	 * Callbacks rather than component events: this menu is mounted through
	 * TanStack's `flexRender`, whose wrapper doesn't forward events. The page
	 * owns the confirmation dialogs — a dialog rendered in here would be torn
	 * down as soon as the table store re-emits.
	 */
	export let onCancel: (() => void) | undefined = undefined;
	export let onDelete: (() => void) | undefined = undefined;
</script>

<ActionMenuButton>
	<DropdownMenu.Item class="gap-2">
		<!-- A real anchor rather than goto() so middle-click / open-in-new-tab work. -->
		<a {href} class="flex w-full items-center gap-2">
			<Eye size={16} />
			<span>View</span>
		</a>
	</DropdownMenu.Item>
	{#if canCancel}
		<DropdownMenu.Item class="gap-2" on:click={() => onCancel?.()}>
			<XCircle size={16} />
			<span>Cancel</span>
		</DropdownMenu.Item>
	{/if}
	{#if canDelete}
		<DropdownMenu.Separator />
		<DropdownMenu.Item
			class="gap-2 text-red-500 focus:text-red-500"
			on:click={() => onDelete?.()}
		>
			<Trash2 size={16} />
			<span>Delete</span>
		</DropdownMenu.Item>
	{/if}
</ActionMenuButton>
