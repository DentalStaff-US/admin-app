<script lang="ts">
	import { superForm } from 'sveltekit-superforms/client';
	import { Check, Search, X } from 'lucide-svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { cn } from '$lib/utils';
	import ConversationAvatar from './ConversationAvatar.svelte';
	import { fullName, initialsOf } from '../inbox';

	type Person = { id?: string; email?: string | null; firstName?: string | null; lastName?: string | null; avatarUrl?: string | null };

	let {
		open = $bindable(false),
		people,
		userId,
		form: formData
	}: { open?: boolean; people: Person[]; userId?: string; form: any } = $props();

	// Same form as before: `userIDs` is a JSON array posted to ?/startConversation.
	// svelte-ignore state_referenced_locally
	const { enhance, submitting } = superForm(formData);

	let query = $state('');
	let selected = $state<Person[]>([]);

	const matches = $derived.by(() => {
		const q = query.trim().toLowerCase();
		const seen = new Set<string>();
		return people.filter((p) => {
			if (!p.id || p.id === userId || seen.has(p.id)) return false;
			seen.add(p.id);
			return !q || [p.firstName, p.lastName, p.email].some((v) => v?.toLowerCase().includes(q));
		});
	});
	const ids = $derived(JSON.stringify(selected.map((p) => p.id)));
	const isSelected = (p: Person) => selected.some((s) => s.id === p.id);
	const toggle = (p: Person) => (selected = isSelected(p) ? selected.filter((s) => s.id !== p.id) : [...selected, p]);

	$effect(() => {
		if (!open) {
			query = '';
			selected = [];
		}
	});
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-w-lg rounded-2xl shadow-float">
		<form method="POST" action="?/startConversation" use:enhance class="space-y-4">
			<Dialog.Header class="text-left">
				<Dialog.Title class="text-h2">New message</Dialog.Title>
				<Dialog.Description>Pick one or more people. If you already have a conversation with exactly them, it opens instead.</Dialog.Description>
			</Dialog.Header>

			{#if selected.length}
				<ul class="flex flex-wrap gap-2" aria-label="Selected people">
					{#each selected as p (p.id)}
						<li class="inline-flex items-center gap-1 rounded-full border bg-muted py-0.5 pl-2.5 pr-1 text-sm font-semibold">
							{fullName(p) || p.email}
							<button
								type="button"
								class="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								aria-label="Remove {fullName(p) || p.email}"
								onclick={() => toggle(p)}
							>
								<X class="size-3.5" aria-hidden="true" />
							</button>
						</li>
					{/each}
				</ul>
			{/if}

			<div class="relative">
				<Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
				<Input type="search" bind:value={query} placeholder="Search by name or email" aria-label="Search people" class="pl-9" />
			</div>

			<ul class="relative max-h-64 divide-y overflow-y-auto rounded-md border" aria-label="People">
				{#each matches as p (p.id)}
					{@const on = isSelected(p)}
					<li>
						<button
							type="button"
							aria-pressed={on}
							class={cn(
								'flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
								on && 'bg-primary-soft hover:bg-primary-soft'
							)}
							onclick={() => toggle(p)}
						>
							<ConversationAvatar initials={initialsOf(fullName(p) || p.email || '?')} avatarUrl={p.avatarUrl} />
							<span class="min-w-0 flex-1">
								<span class="block truncate font-semibold">{fullName(p) || p.email}</span>
								<span class="block truncate text-sm text-muted-foreground">{p.email}</span>
							</span>
							{#if on}<Check class="size-4 shrink-0 text-primary-dark" aria-hidden="true" />{/if}
						</button>
					</li>
				{:else}
					<li class="p-4 text-center text-sm text-muted-foreground">No people found</li>
				{/each}
			</ul>

			<input type="hidden" name="userIDs" value={ids} />
			<Dialog.Footer class="gap-2">
				<Button type="button" variant="outline" on:click={() => (open = false)}>Cancel</Button>
				<Button type="submit" disabled={selected.length === 0 || $submitting}>
					{$submitting ? 'Starting…' : selected.length > 1 ? `Message ${selected.length} people` : 'Start conversation'}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
