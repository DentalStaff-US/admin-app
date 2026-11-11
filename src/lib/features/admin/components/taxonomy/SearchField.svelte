<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Search } from 'lucide-svelte';
	import { Input } from '$lib/components/ui/input';
	import { withParam } from '$dtss/tableState';

	let {
		value = '',
		label,
		placeholder,
		param = 'search'
	}: { value?: string; label: string; placeholder?: string; param?: string } = $props();

	let term = $state(value);
	let timer: ReturnType<typeof setTimeout> | undefined;

	// 03 › FilterBar: search is instant with a debounce; no separate Search button.
	function run(next: string) {
		clearTimeout(timer);
		const url = withParam(page.url, param, next.trim());
		if (url !== `${page.url.pathname}${page.url.search}`) {
			goto(url, { keepFocus: true, noScroll: true, replaceState: true });
		}
	}

	function onInput() {
		clearTimeout(timer);
		timer = setTimeout(() => run(term), 300);
	}
</script>

<form
	role="search"
	class="relative w-full max-w-sm"
	onsubmit={(event) => {
		event.preventDefault();
		run(term);
	}}
>
	<label for="taxonomy-search" class="sr-only">{label}</label>
	<Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
	<Input id="taxonomy-search" type="search" class="pl-9" placeholder={placeholder ?? label} bind:value={term} on:input={onInput} />
</form>
