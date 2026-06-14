<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Alert from '$lib/components/ui/alert';
	import { CreditCard, LifeBuoy, ChevronRight, AlertCircle } from 'lucide-svelte';
	import { page } from '$app/stores';
	import { openStripeSetupInNewTab } from '$lib/_helpers/openStripeSetup';
	import SupportTicketDialog from '$lib/components/dialogs/supportTicketDialog.svelte';

	export let data;

	let setupSubmitting = false;
	let setupError = '';
	let helpOpen = false;

	$: canceled = $page.url.searchParams.get('canceled') === '1';

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
</script>

<section class="container mx-auto max-w-2xl px-4 py-10">
	<header class="mb-6 text-center">
		<h1 class="text-3xl font-bold tracking-tight">Set up billing</h1>
		<p class="mt-2 text-muted-foreground">
			One last step. Adding a payment method lets you start hiring once you're approved — you can
			skip this for now if you'd rather schedule a call.
		</p>
	</header>

	{#if canceled}
		<Alert.Root class="mb-6">
			<AlertCircle class="h-4 w-4" />
			<Alert.Title>Setup was canceled</Alert.Title>
			<Alert.Description>
				No payment method was saved. You can try again below or skip for now.
			</Alert.Description>
		</Alert.Root>
	{/if}

	{#if data.subscriptionPending}
		<Alert.Root class="mb-6">
			<AlertCircle class="h-4 w-4" />
			<Alert.Title>Setup in progress</Alert.Title>
			<Alert.Description>
				It looks like you started Stripe setup but didn't finish. Click below to continue, or skip
				for now.
			</Alert.Description>
		</Alert.Root>
	{/if}

	{#if setupError}
		<Alert.Root variant="destructive" class="mb-6">
			<AlertCircle class="h-4 w-4" />
			<Alert.Description>{setupError}</Alert.Description>
		</Alert.Root>
	{/if}

	<div class="grid gap-4">
		<!-- Primary: Stripe setup (opens in new tab) -->
		<Card.Root>
			<Card.Header class="flex flex-row items-start gap-4">
				<div class="p-3 rounded-md bg-blue-50 text-blue-700">
					<CreditCard class="h-5 w-5" />
				</div>
				<div class="flex-1">
					<Card.Title>Set up billing now (recommended)</Card.Title>
					<Card.Description>
						Secure checkout with Stripe — opens in a new tab. We'll save a card or ACH bank
						account on file. You won't be charged anything today.
					</Card.Description>
				</div>
			</Card.Header>
			<Card.Footer>
				<Button
					type="button"
					class="bg-primary hover:bg-primary/90 gap-2"
					disabled={setupSubmitting}
					on:click={startSetup}
				>
					{setupSubmitting ? 'Opening Stripe…' : 'Set up with Stripe'}
					<ChevronRight class="h-4 w-4" />
				</Button>
			</Card.Footer>
		</Card.Root>

		<!-- Secondary: support ticket modal -->
		<Card.Root>
			<Card.Header class="flex flex-row items-start gap-4">
				<div class="p-3 rounded-md bg-yellow-50 text-yellow-700">
					<LifeBuoy class="h-5 w-5" />
				</div>
				<div class="flex-1">
					<Card.Title>Need help? Have an admin reach out</Card.Title>
					<Card.Description>
						We'll send your request to an admin who can help configure the right payment method
						for your business.
					</Card.Description>
				</div>
			</Card.Header>
			<Card.Footer>
				<Button type="button" variant="outline" on:click={() => (helpOpen = true)}>
					Request admin help
				</Button>
			</Card.Footer>
		</Card.Root>

		<!-- Tertiary: skip -->
		<div class="flex justify-center pt-2">
			<Button
				type="button"
				variant="ghost"
				class="text-muted-foreground"
				on:click={() => goto('/dashboard')}
			>
				Skip for now
			</Button>
		</div>
	</div>

	<p class="mt-8 text-center text-xs text-muted-foreground">
		You can always set this up later from <strong>Settings &rarr; Billing</strong> or via the prompt
		on your dashboard.
	</p>
</section>

<SupportTicketDialog
	bind:open={helpOpen}
	title="Get help setting up billing"
	description="Tell us anything that would help — preferred contact times, payment method preference, etc. An admin will reach out."
	defaultTitle="Billing setup help needed"
	defaultBody="I'd like an admin to help me set up billing for my account."
	submitLabel="Request admin help"
	onSuccess={() => goto('/dashboard')}
/>
