<script lang="ts">
	import { Building2, CreditCard, Download, ExternalLink, Loader2 } from 'lucide-svelte';
	import { superForm } from 'sveltekit-superforms/client';
	import { invalidateAll } from '$app/navigation';
	import ConfirmDialog from '$dtss/ConfirmDialog.svelte';
	import Section from '$dtss/Section.svelte';
	import StatusBadge from '$dtss/StatusBadge.svelte';
	import { openStripeSetupInNewTab } from '$lib/_helpers/openStripeSetup';
	import SupportTicketDialog from '$lib/components/dialogs/supportTicketDialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { firstError } from '../forms';
	import Field from './Field.svelte';
	import SettingsPanel from './SettingsPanel.svelte';

	let {
		user,
		billingInfo,
		billingContactForm
	}: { user: any; billingInfo: any; billingContactForm: any } = $props();

	// svelte-ignore state_referenced_locally
	const { form, errors, enhance, submitting } = superForm(billingContactForm);

	// Billing card: Stripe setup opens in a new tab so the app tab isn't lost,
	// and "Need help?" opens the shared support modal.
	let billingSetupSubmitting = $state(false);
	let billingSetupError = $state('');
	let billingHelpOpen = $state(false);
	let portalSubmitting = $state(false);
	let confirmReplace = $state(false);

	async function startBillingSetup() {
		billingSetupError = '';
		billingSetupSubmitting = true;
		await openStripeSetupInNewTab({
			onReturn: () => invalidateAll(),
			onError: (msg) => {
				billingSetupError = msg;
			}
		});
		billingSetupSubmitting = false;
	}

	// Swapping an existing method (incl. re-authorizing a lapsed ACH mandate).
	// `intent: 'replace'` stops the server short-circuiting on "already set up",
	// which is always true here and left the button permanently broken.
	async function startBillingReplacement() {
		confirmReplace = false;
		billingSetupError = '';
		billingSetupSubmitting = true;
		await openStripeSetupInNewTab({
			intent: 'replace',
			onReturn: () => invalidateAll(),
			onError: (msg) => {
				billingSetupError = msg;
			}
		});
		billingSetupSubmitting = false;
	}

	async function openBillingPortal() {
		billingSetupError = '';
		portalSubmitting = true;
		try {
			const response = await fetch('/api/stripe/create-portal-session', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' }
			});
			if (!response.ok) throw new Error(`Portal session returned ${response.status}`);
			const { url } = await response.json();
			if (!url) throw new Error('No portal URL returned');
			window.location.href = url;
		} catch (err) {
			console.error('Error creating portal session:', err);
			billingSetupError = 'Could not open the Stripe billing portal. Please try again.';
		} finally {
			portalSubmitting = false;
		}
	}

	const method = $derived(billingInfo?.paymentMethod ?? null);
	const isBank = $derived(method?.type === 'us_bank_account');
	const methodName = $derived(
		!method
			? ''
			: isBank
				? `${method.bankName ?? 'Bank account'} •••• ${method.last4}`
				: `${method.brand ? method.brand.toUpperCase() : 'Card'} •••• ${method.last4}`
	);
	const methodDetail = $derived(
		!method
			? ''
			: isBank
				? `ACH direct debit${method.accountType ? ` · ${method.accountType}` : ''}`
				: method.expiryMonth
					? `Expires ${method.expiryMonth}/${method.expiryYear}`
					: 'On file'
	);
	// Three states: no customer (or setup unfinished) → set up; customer but no
	// subscription → replace or portal; customer + subscription → portal.
	const stage = $derived(
		!billingInfo?.clientSubscription?.stripeCustomerId || billingInfo?.clientSubscription?.stripeCustomerSetupPending
			? 'setup'
			: !billingInfo?.subscription
				? 'on-file'
				: 'subscribed'
	);
</script>

<SettingsPanel title="Billing" description="Where invoices go and how they're paid.">
	<!-- Billing contact: where invoices are sent. Separate from the sign-in email. -->
	<form method="POST" action="?/updateBillingContact" use:enhance>
		<Section title="Billing contact" description="Invoices and billing notices go here, not to your sign-in email.">
			<div class="grid gap-4 sm:grid-cols-2">
				<Field id="billingEmail" label="Billing email: where invoices are sent" description={`Leave blank to send invoices to your sign-in email (${user?.email ?? ''}).`} error={$errors.billingEmail} class="sm:col-span-2">
					<Input id="billingEmail" name="billingEmail" type="email" placeholder={user?.email} bind:value={$form.billingEmail} aria-invalid={$errors.billingEmail ? 'true' : undefined} />
				</Field>
				<Field id="billingContactName" label="Contact name" error={$errors.billingContactName}>
					<Input id="billingContactName" name="billingContactName" placeholder="e.g. Accounts payable" bind:value={$form.billingContactName} aria-invalid={$errors.billingContactName ? 'true' : undefined} />
				</Field>
			</div>

			<div class="mt-6 border-t pt-5">
				<h3 class="text-sm font-bold">Billing address</h3>
				<p class="text-sm text-muted-foreground">Printed on your invoices. Leave blank to use your primary location's address.</p>
				<div class="mt-4 grid gap-4 sm:grid-cols-2">
					<Field id="billingStreetOne" label="Street address" error={$errors.billingStreetOne} class="sm:col-span-2">
						<Input id="billingStreetOne" name="billingStreetOne" autocomplete="address-line1" bind:value={$form.billingStreetOne} />
					</Field>
					<Field id="billingStreetTwo" label="Suite or unit (optional)" class="sm:col-span-2">
						<Input id="billingStreetTwo" name="billingStreetTwo" autocomplete="address-line2" bind:value={$form.billingStreetTwo} />
					</Field>
					<Field id="billingCity" label="City" error={$errors.billingCity}>
						<Input id="billingCity" name="billingCity" autocomplete="address-level2" bind:value={$form.billingCity} />
					</Field>
					<div class="grid grid-cols-2 gap-4">
						<Field id="billingState" label="State" error={$errors.billingState}>
							<Input id="billingState" name="billingState" maxlength={2} placeholder="NY" autocomplete="address-level1" bind:value={$form.billingState} />
						</Field>
						<Field id="billingZipcode" label="ZIP" error={$errors.billingZipcode}>
							<Input id="billingZipcode" name="billingZipcode" placeholder="10001" inputmode="numeric" autocomplete="postal-code" bind:value={$form.billingZipcode} />
						</Field>
					</div>
				</div>
			</div>

			{#if firstError($errors._errors)}<p class="mt-4 text-sm text-destructive" role="alert">{firstError($errors._errors)}</p>{/if}
			<div class="mt-6 flex justify-end border-t pt-4">
				<Button type="submit" disabled={$submitting}>
					{#if $submitting}<Loader2 class="mr-2 size-4 animate-spin" aria-hidden="true" />Saving…{:else}Save billing contact{/if}
				</Button>
			</div>
		</Section>
	</form>

	<Section title="Payment method">
		{#snippet actions()}
			{#if billingInfo?.subscription}
				<p class="text-right">
					<span class="text-xl font-extrabold tabular-nums">${billingInfo.subscription.amount}</span>
					<span class="text-sm text-muted-foreground">per {billingInfo.subscription.interval}</span>
				</p>
			{/if}
		{/snippet}
		<div class="space-y-4">
			{#if method}
				<div class="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
					<span class="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card">
						{#if isBank}<Building2 class="size-5" aria-hidden="true" />{:else}<CreditCard class="size-5" aria-hidden="true" />{/if}
					</span>
					<div class="min-w-0">
						<p class="font-semibold">{methodName}</p>
						<p class="text-sm text-muted-foreground">{methodDetail}</p>
					</div>
				</div>
			{/if}

			{#if stage === 'setup'}
				<p class="text-sm text-muted-foreground">
					Save a card or bank account so we can bill for shifts. You won't be charged anything today.
				</p>
				<div class="flex flex-wrap gap-2">
					<Button disabled={billingSetupSubmitting} on:click={startBillingSetup}>
						{billingSetupSubmitting ? 'Opening Stripe…' : 'Set up billing with Stripe'}
					</Button>
					<Button variant="outline" on:click={() => (billingHelpOpen = true)}>Need help?</Button>
				</div>
			{:else if stage === 'on-file'}
				<p class="text-sm text-muted-foreground">
					Payment method on file. Subscription management will appear here when it's activated.
				</p>
				<div class="flex flex-wrap gap-2">
					<Button variant="outline" disabled={billingSetupSubmitting} on:click={() => (confirmReplace = true)}>
						{billingSetupSubmitting ? 'Opening Stripe…' : 'Replace payment method…'}
					</Button>
					<Button variant="outline" disabled={portalSubmitting} on:click={openBillingPortal}>
						<ExternalLink class="mr-2 size-4" aria-hidden="true" />
						{portalSubmitting ? 'Opening portal…' : 'Manage billing in Stripe'}
					</Button>
				</div>
			{:else}
				<Button disabled={portalSubmitting} on:click={openBillingPortal}>
					<ExternalLink class="mr-2 size-4" aria-hidden="true" />
					{portalSubmitting ? 'Opening portal…' : 'Manage subscription in Stripe'}
				</Button>
			{/if}
			{#if billingSetupError}<p class="text-sm text-destructive" role="alert">{billingSetupError}</p>{/if}
		</div>
	</Section>

	{#if billingInfo?.invoices?.length}
		<Section title="Billing history" flush>
			<ul class="divide-y">
				{#each billingInfo.invoices as invoice, i (invoice.id ?? i)}
					<li class="flex flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-6">
						<div>
							<p class="font-semibold">{new Date(invoice.date).toLocaleDateString()}</p>
							<p class="text-sm tabular-nums text-muted-foreground">${invoice.amount}</p>
						</div>
						<div class="flex items-center gap-2">
							<StatusBadge status={invoice.status} />
							{#if invoice.pdfUrl}
								<Button variant="ghost" size="sm" href={invoice.pdfUrl} target="_blank" rel="noopener noreferrer">
									<Download class="mr-1 size-4" aria-hidden="true" /> PDF
								</Button>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		</Section>
	{/if}
</SettingsPanel>

<ConfirmDialog
	bind:open={confirmReplace}
	title={`Replace ${methodName || 'your payment method'}?`}
	description="Stripe opens in a new tab so you can save a new card or bank account. Nothing changes until you finish there."
>
	{#snippet confirm()}
		<Button class="min-h-11 sm:min-h-10" on:click={startBillingReplacement}>Continue to Stripe</Button>
	{/snippet}
</ConfirmDialog>

<!-- Shared support modal for "Need help?" -->
<SupportTicketDialog
	bind:open={billingHelpOpen}
	title="Get help setting up billing"
	description="Tell us anything that would help — preferred contact times, payment method preference, etc. An admin will reach out."
	defaultTitle="Billing setup help needed"
	defaultBody="I'd like an admin to help me set up billing for my account."
	submitLabel="Request admin help"
/>
