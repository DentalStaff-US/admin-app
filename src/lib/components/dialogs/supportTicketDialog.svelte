<script lang="ts">
	// Lightweight modal for opening a support ticket from anywhere in the app.
	// Distinct from the heavier bug-report-style newSupportTicketDialog.svelte
	// used on the /support page. This one is for "I need help" / "Contact us"
	// style prompts triggered from banners, cards, onboarding screens, etc.
	//
	// Usage:
	//   <SupportTicketDialog
	//     bind:open
	//     defaultTitle="Billing setup help needed"
	//     defaultBody="..."
	//     onSuccess={() => doSomething()}
	//   />
	//
	// Posts to /api/support/tickets (internal session-auth endpoint). The admin
	// email notification fires from inside createSupportTicket() — no extra
	// wiring needed here.
	import { Loader2 } from 'lucide-svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as Alert from '$lib/components/ui/alert';
	import { AlertCircle } from 'lucide-svelte';

	export let open = false;
	export let defaultTitle = '';
	export let defaultBody = '';
	export let title = 'Contact support';
	export let description = "Tell us what's going on and an admin will reach out.";
	export let submitLabel = 'Send to support';
	export let onSuccess: (() => void) | undefined = undefined;

	let ticketTitle = defaultTitle;
	let ticketBody = defaultBody;
	let submitting = false;
	let errorMessage = '';

	// Refresh fields when the caller updates the defaults (e.g. context-aware
	// prefill that changes between opens).
	$: if (open) {
		errorMessage = '';
		if (ticketTitle === '') ticketTitle = defaultTitle;
		if (ticketBody === '') ticketBody = defaultBody;
	}

	async function submit() {
		errorMessage = '';
		if (!ticketTitle.trim()) {
			errorMessage = 'Please enter a short title.';
			return;
		}
		submitting = true;
		try {
			const res = await fetch('/api/support/tickets', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title: ticketTitle.trim(), body: ticketBody.trim() })
			});
			if (!res.ok) {
				const errBody = await res.json().catch(() => ({}));
				errorMessage = errBody.message ?? 'Could not submit your request. Please try again.';
				return;
			}
			open = false;
			ticketTitle = defaultTitle;
			ticketBody = defaultBody;
			onSuccess?.();
		} catch (err) {
			console.error('SupportTicketDialog submit failed', err);
			errorMessage = 'Network error. Please try again.';
		} finally {
			submitting = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-[480px]">
		<Dialog.Header>
			<Dialog.Title>{title}</Dialog.Title>
			<Dialog.Description>{description}</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-4 py-2">
			{#if errorMessage}
				<Alert.Root variant="destructive">
					<AlertCircle class="h-4 w-4" />
					<Alert.Description>{errorMessage}</Alert.Description>
				</Alert.Root>
			{/if}

			<div class="space-y-2">
				<Label for="ticket-title">Subject</Label>
				<Input
					id="ticket-title"
					bind:value={ticketTitle}
					placeholder="Short summary"
					required
					disabled={submitting}
				/>
			</div>
			<div class="space-y-2">
				<Label for="ticket-body">Message</Label>
				<Textarea
					id="ticket-body"
					bind:value={ticketBody}
					placeholder="Add any details, preferred contact times, or context that would help us."
					rows={5}
					disabled={submitting}
				/>
			</div>
		</div>

		<Dialog.Footer>
			<Button variant="outline" type="button" on:click={() => (open = false)} disabled={submitting}>
				Cancel
			</Button>
			<Button type="button" on:click={submit} disabled={submitting}>
				{#if submitting}
					<Loader2 class="mr-2 h-4 w-4 animate-spin" />
					Sending…
				{:else}
					{submitLabel}
				{/if}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
