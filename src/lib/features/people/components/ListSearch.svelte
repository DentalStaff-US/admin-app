<script lang="ts">
	import { untrack } from 'svelte';
	import { Search } from 'lucide-svelte';
	import { Input } from '$lib/components/ui/input';
	import { debounce } from '$lib/_helpers/debounce';

	/**
	 * Instant, debounced search for a list (03 › FilterBar: no separate Search
	 * button). The input keeps its own copy so a slow navigation can't
	 * overwrite characters typed since; it only adopts the URL value when that
	 * changed to something we didn't submit (back/forward, a pasted link).
	 */
	let {
		applied,
		label,
		placeholder,
		delay = 800,
		onSearch
	}: {
		applied: string;
		label: string;
		placeholder: string;
		delay?: number;
		onSearch: (value: string) => void;
	} = $props();

	let input = $state(untrack(() => applied));
	let lastSubmitted = untrack(() => applied);

	$effect(() => {
		if (applied !== lastSubmitted) {
			input = applied;
			lastSubmitted = applied;
		}
	});

	const push = debounce((value: string) => {
		lastSubmitted = value.trim();
		onSearch(value);
	}, delay);
</script>

<form role="search" class="relative w-full sm:max-w-xs" onsubmit={(e) => e.preventDefault()}>
	<label for="list-search" class="sr-only">{label}</label>
	<Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
	<Input id="list-search" type="search" class="pl-9" bind:value={input} on:input={() => push(input)} {placeholder} />
</form>
