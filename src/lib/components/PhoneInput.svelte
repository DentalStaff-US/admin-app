<script lang="ts">
	import { Input } from '$lib/components/ui/input';

	// Drop-in replacement for `<Input type="tel">`. Auto-formats US phone
	// input as the user types so they see "(386) 327-7843" while only the
	// digits are kept in the bound value. The server `usPhoneField()` zod
	// transform normalizes the eventual submitted value to E.164.
	//
	// Usage:
	//   <PhoneInput name="cellPhone" bind:value={$form.cellPhone} />

	let className: string | undefined = undefined;
	export { className as class };
	export let name: string | undefined = undefined;
	export let id: string | undefined = undefined;
	export let value: string | null | undefined = '';
	export let placeholder = '(555) 555-5555';
	export let required = false;
	export let disabled = false;

	function formatDisplay(raw: string | null | undefined): string {
		if (!raw) return '';
		const digits = raw.replace(/\D/g, '');
		// Drop a leading "1" so (XXX) XXX-XXXX always reflects the local 10 digits.
		const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
		const trimmed = local.slice(0, 10);

		if (trimmed.length === 0) return '';
		if (trimmed.length <= 3) return `(${trimmed}`;
		if (trimmed.length <= 6) return `(${trimmed.slice(0, 3)}) ${trimmed.slice(3)}`;
		return `(${trimmed.slice(0, 3)}) ${trimmed.slice(3, 6)}-${trimmed.slice(6)}`;
	}

	let displayed = formatDisplay(value);

	// Keep the displayed string in sync if the bound value is reset/replaced
	// from outside (e.g. superForm reset, server-returned form data).
	$: displayed = formatDisplay(value);

	function handleInput(e: Event) {
		const target = e.target as HTMLInputElement;
		const next = formatDisplay(target.value);
		displayed = next;
		// Bubble the formatted value up — the server `usPhoneField()` zod
		// transform strips non-digits, so this is fine to submit as-is.
		value = next;
	}
</script>

<Input
	type="tel"
	autocomplete="tel"
	inputmode="numeric"
	{id}
	{name}
	{placeholder}
	{required}
	{disabled}
	value={displayed}
	on:input={handleInput}
	class={className}
/>
