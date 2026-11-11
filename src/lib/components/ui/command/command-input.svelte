<script lang="ts">
	import { Command as CommandPrimitive } from "cmdk-sv";
	import { Search } from "lucide-svelte";
	import { cn } from "$lib/utils";

	type $$Props = CommandPrimitive.InputProps;

	let className: string | undefined | null = undefined;
	export { className as class };
	export let value: string = "";
</script>

<div class="flex items-center border-b px-2" data-cmdk-input-wrapper="">
	<Search class="mr-2 h-4 w-4 shrink-0 opacity-50" />
	<CommandPrimitive.Input
		class={cn(
			// border-0/ring-0: flowbite's form plugin otherwise boxes every input.
			"flex h-11 w-full rounded-md border-0 bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50",
			className
		)}
		{...$$restProps}
		bind:value
	/>
</div>
