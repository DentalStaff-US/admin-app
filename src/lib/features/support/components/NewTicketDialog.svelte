<script lang="ts">
	import { Loader2 } from 'lucide-svelte';
	import { superForm } from 'sveltekit-superforms/client';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';

	// The settings-era NewSupportTicketDialog, restyled: same fields, same
	// POST to /support's default action. Four fields, one purpose: a Dialog.
	let { open = $bindable(false), form: initial }: { open?: boolean; form: any } = $props();

	// svelte-ignore state_referenced_locally
	const { enhance, submitting } = superForm(initial);

	const FIELDS = [
		{ name: 'expectedResults', label: 'What were you trying to do?', hint: 'What you expected to happen.' },
		{ name: 'actualResults', label: 'What happened instead?', hint: 'Any error message helps.' },
		{ name: 'stepsToReproduce', label: 'How can we see it?', hint: 'The steps that led there, one per line.' }
	];
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="flex max-h-[90dvh] max-w-lg flex-col gap-0 rounded-2xl p-0">
		<form use:enhance method="POST" action="/support" class="flex min-h-0 flex-1 flex-col">
			<Dialog.Header class="shrink-0 p-6 pb-4">
				<Dialog.Title class="text-h2">New support ticket</Dialog.Title>
				<Dialog.Description>Tell us what's going on and our team will reply here.</Dialog.Description>
			</Dialog.Header>
			<!-- Only the fields scroll; header and footer stay put on small screens. -->
			<div class="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-1">
				<div class="space-y-1.5">
					<label for="ticket-title" class="block text-sm font-semibold">Subject</label>
					<Input id="ticket-title" name="title" required placeholder="e.g. Can't approve a timesheet" />
				</div>
				{#each FIELDS as field (field.name)}
					<div class="space-y-1.5">
						<label for={`ticket-${field.name}`} class="block text-sm font-semibold">{field.label}</label>
						<Textarea id={`ticket-${field.name}`} name={field.name} required rows={3} aria-describedby={`ticket-${field.name}-hint`} />
						<p id={`ticket-${field.name}-hint`} class="text-sm text-muted-foreground">{field.hint}</p>
					</div>
				{/each}
			</div>
			<div class="flex shrink-0 flex-col-reverse gap-3 border-t p-6 pt-4 sm:flex-row sm:justify-end">
				<Button type="button" variant="outline" on:click={() => (open = false)}>Cancel</Button>
				<Button type="submit" disabled={$submitting}>
					{#if $submitting}<Loader2 class="mr-2 size-4 animate-spin" aria-hidden="true" />Sending…{:else}Send to support{/if}
				</Button>
			</div>
		</form>
	</Dialog.Content>
</Dialog.Root>
