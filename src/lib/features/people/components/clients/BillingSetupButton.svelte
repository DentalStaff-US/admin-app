<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { Copy, CreditCard } from 'lucide-svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import Notice from '$dtss/Notice.svelte';

	/**
	 * "Set up payment" for a practice without a usable Stripe customer: asks
	 * /api/stripe/setup-customer for a hosted setup link (which it also emails)
	 * and shows it to share. Errors and the copy confirmation are toasts now,
	 * not alert().
	 */
	let {
		clientId,
		pending = false,
		ownerName,
		ownerEmail
	}: { clientId: string; pending?: boolean; ownerName: string; ownerEmail: string } = $props();

	let loading = $state(false);
	let open = $state(false);
	let link = $state('');
	let emailed = $state(false);
	let emailedTo = $state('');

	async function create() {
		loading = true;
		try {
			const response = await fetch('/api/stripe/setup-customer', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ clientId })
			});
			if (!response.ok) {
				const error = await response.json().catch(() => ({}));
				throw new Error(error.message || 'Failed to create setup session');
			}
			const result = await response.json();
			link = result.url;
			emailed = !!result.emailed;
			emailedTo = result.emailedTo ?? ownerEmail;
			open = true;
		} catch (error) {
			console.error('Error setting up customer:', error);
			toast.error("Couldn't create a setup link. Try again in a moment.");
		} finally {
			loading = false;
		}
	}

	async function copy() {
		try {
			await navigator.clipboard.writeText(link);
			toast.success('Link copied');
		} catch {
			toast.error("Couldn't copy. Select the link and copy it instead.");
		}
	}
</script>

<Button variant="outline" class="gap-2" disabled={loading} on:click={create}>
	<CreditCard class="size-4" aria-hidden="true" />
	{loading ? 'Creating link…' : pending ? 'Resend setup link' : 'Set up payment'}
</Button>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title class="text-h2">{emailed ? 'Payment setup link sent' : 'Payment setup link created'}</Dialog.Title>
			<Dialog.Description>
				{emailed ? `We emailed it to ${ownerName}. You can also share it directly.` : `Share this link with ${ownerName} to finish payment setup.`}
			</Dialog.Description>
		</Dialog.Header>
		<div class="space-y-4">
			{#if emailed}
				<Notice tone="positive">Setup link emailed to <b>{emailedTo}</b>.</Notice>
			{:else}
				<Notice tone="warning">We couldn't email the link automatically. Please share it below.</Notice>
			{/if}
			<div class="space-y-1.5">
				<Label for="setup-link">Setup link</Label>
				<div class="flex gap-2">
					<Input id="setup-link" value={link} readonly class="font-mono text-sm" on:focus={(e) => e.currentTarget.select()} />
					<Button variant="outline" size="icon" class="shrink-0" aria-label="Copy setup link" on:click={copy}>
						<Copy class="size-4" aria-hidden="true" />
					</Button>
				</div>
			</div>
			<ol class="list-inside list-decimal space-y-1 rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
				<li>{emailed ? 'The practice gets this link by email (you can copy it here too)' : 'Send this link to the practice by email or text'}</li>
				<li>They open it and enter a payment method</li>
				<li>Stripe saves it securely</li>
				<li>You can then create and charge invoices</li>
			</ol>
		</div>
		<Dialog.Footer>
			<Button variant="outline" on:click={() => (open = false)}>Done</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
