<script lang="ts">
	import { Building2, CreditCard, ExternalLink, FileText } from 'lucide-svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import Notice from '$dtss/Notice.svelte';
	import { openStripeSetupInNewTab } from '$lib/_helpers/openStripeSetup';
	import SupportTicketDialog from '$lib/components/dialogs/supportTicketDialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import { cn } from '$lib/utils';
	import { billingAction, type BillingChoice } from '../onboarding';
	import StepCard from './StepCard.svelte';

	let {
		subscriptionPending = false,
		canceled = false,
		nextHref = '/onboarding/client/complete'
	}: { subscriptionPending?: boolean; canceled?: boolean; nextHref?: string } = $props();

	const CHOICES: { value: BillingChoice; label: string; description: string; icon: typeof CreditCard }[] = [
		{ value: 'card', label: 'Card', description: 'Credit or debit card, saved with Stripe.', icon: CreditCard },
		{ value: 'bank', label: 'Bank account', description: 'ACH direct debit from a US bank account.', icon: Building2 },
		{ value: 'paper', label: 'Paper invoice', description: 'We send each invoice and you pay it outside Stripe.', icon: FileText }
	];

	let choice = $state<BillingChoice>('card');
	let setupSubmitting = $state(false);
	let setupError = $state('');
	let helpOpen = $state(false);
	let paperOpen = $state(false);

	async function startSetup() {
		setupError = '';
		setupSubmitting = true;
		await openStripeSetupInNewTab({
			onReturn: () => invalidateAll(),
			onError: (msg) => {
				setupError = msg;
			}
		});
		setupSubmitting = false;
	}

	function next() {
		if (billingAction(choice) === 'stripe') startSetup();
		else paperOpen = true;
	}
</script>

{#if canceled}
	<Notice tone="warning" title="Setup was canceled">No payment method was saved. Try again, or skip for now.</Notice>
{:else if subscriptionPending}
	<Notice tone="pending" title="Setup in progress">You started Stripe setup but didn't finish. Continue below, or skip for now.</Notice>
{/if}
{#if setupError}<Notice tone="negative" alert>{setupError}</Notice>{/if}

<StepCard>
	<fieldset>
		<legend class="text-sm font-semibold">How would you like to pay?</legend>
		<!-- 04 §3 split panels as radio cards. -->
		<div class="mt-3 grid gap-3 sm:grid-cols-3">
			{#each CHOICES as option (option.value)}
				<label
					class={cn(
						'relative flex cursor-pointer items-start gap-3 rounded-2xl border bg-gradient-to-br from-primary-soft via-card to-card p-4 ring-1 ring-primary/15 transition-shadow sm:flex-col duration-fast hover:shadow-lift',
						'has-[:checked]:border-primary has-[:checked]:ring-2 has-[:checked]:ring-primary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring'
					)}
				>
					<input type="radio" name="billing-choice" value={option.value} bind:group={choice} class="peer sr-only" />
					<span class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-strong text-primary-foreground">
						<option.icon class="size-5" aria-hidden="true" />
					</span>
					<span>
						<span class="block font-bold">{option.label}</span>
						<span class="mt-0.5 block text-sm text-muted-foreground">{option.description}</span>
					</span>
				</label>
			{/each}
		</div>
	</fieldset>

	{#if choice === 'paper'}
		<p class="text-sm text-muted-foreground">
			Paper invoicing is set up by our team. Send a request and an admin will follow up.
		</p>
	{:else}
		<p class="text-sm text-muted-foreground">
			Stripe's secure checkout opens in a new tab, where you choose {choice === 'card' ? 'a card' : 'US bank account'} and
			save it. You won't be charged anything today.
		</p>
	{/if}

	{#snippet footer()}
		<div class="flex flex-col-reverse gap-2 sm:flex-row">
			<Button variant="ghost" class="text-muted-foreground" on:click={() => goto(nextHref)}>Skip for now</Button>
			<Button variant="ghost" class="text-muted-foreground" on:click={() => (helpOpen = true)}>Talk to us first</Button>
		</div>
		<Button class="w-full sm:w-auto" disabled={setupSubmitting} on:click={next}>
			{#if choice === 'paper'}
				Request paper invoices
			{:else}
				{setupSubmitting ? 'Opening Stripe…' : 'Continue to Stripe'}
				<ExternalLink class="ml-2 size-4" aria-hidden="true" />
			{/if}
		</Button>
	{/snippet}
</StepCard>

<p class="text-center text-sm text-muted-foreground">
	You can change this later in <span class="font-semibold text-foreground">Settings › Billing</span>.
</p>

<SupportTicketDialog
	bind:open={helpOpen}
	title="Get help setting up billing"
	description="Tell us anything that would help — preferred contact times, payment method preference, etc. An admin will reach out."
	defaultTitle="Billing setup help needed"
	defaultBody="I'd like an admin to help me set up billing for my account."
	submitLabel="Request admin help"
	onSuccess={() => goto(nextHref)}
/>

<SupportTicketDialog
	bind:open={paperOpen}
	title="Pay by paper invoice"
	description="An admin will review your request and set up paper invoicing. Add anything we should know, like who should receive the invoices."
	defaultTitle="Paper invoicing request"
	defaultBody="We'd like to pay by paper invoice instead of a card or bank account."
	submitLabel="Send request"
	onSuccess={() => goto(nextHref)}
/>
