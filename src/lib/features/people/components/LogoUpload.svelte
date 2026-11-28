<script lang="ts">
	import { ImagePlus, Loader2, X } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { uploadImage } from '$lib/_helpers/uploadImage';
	import PersonAvatar from './PersonAvatar.svelte';

	/**
	 * An organisation's avatar: upload, replace or remove. Uploads straight away
	 * and posts the result as `name` with the rest of the form; nothing changes
	 * until that form is saved. Blank removes it.
	 */
	let {
		value = $bindable(null),
		saved = null,
		name,
		label,
		initials,
		fallback = null
	}: {
		value?: string | null;
		/** What's stored now. Posted only when changed, so an older image is left alone. */
		saved?: string | null;
		/** The form field the URL posts as. */
		name: string;
		label: string;
		initials: string;
		/** Shown when there's none of its own (a location shows its practice's). */
		fallback?: string | null;
	} = $props();

	let input = $state<HTMLInputElement>();
	let uploading = $state(false);
	let error = $state('');

	async function pick(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		uploading = true;
		error = '';
		try {
			value = await uploadImage(file);
		} catch (err) {
			error = err instanceof Error ? err.message : 'The image could not be uploaded.';
		} finally {
			uploading = false;
			if (input) input.value = '';
		}
	}
</script>

<div class="flex items-center gap-4">
	<PersonAvatar name={label} src={value || fallback} {initials} size="lg" kind="org" />
	<div class="space-y-1">
		<div class="flex flex-wrap gap-2">
			<Button type="button" variant="outline" size="sm" class="gap-2" disabled={uploading} on:click={() => input?.click()}>
				{#if uploading}<Loader2 class="size-4 animate-spin" aria-hidden="true" />Uploading…{:else}<ImagePlus class="size-4" aria-hidden="true" />{value ? 'Change' : 'Upload'} {label.toLowerCase()}{/if}
			</Button>
			{#if value}
				<Button type="button" variant="ghost" size="sm" class="gap-2" disabled={uploading} on:click={() => (value = null)}>
					<X class="size-4" aria-hidden="true" />Remove
				</Button>
			{/if}
		</div>
		{#if error}
			<p class="text-sm text-destructive" role="alert">{error}</p>
		{:else}
			<p class="text-caption text-muted-foreground">JPG, PNG or WebP, up to 2 MB.{!value && fallback ? " Using the practice's until you add one." : ''}</p>
		{/if}
	</div>
	<input bind:this={input} type="file" accept="image/png,image/jpeg,image/webp" class="hidden" onchange={pick} aria-label="Choose {label.toLowerCase()}" />
	{#if (value ?? '') !== (saved ?? '')}<input type="hidden" {name} value={value ?? ''} />{/if}
</div>
