<script lang="ts">
	import { Pencil } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import FactGrid, { type Fact } from '$dtss/FactGrid.svelte';
	import Notice from '$dtss/Notice.svelte';
	import Section from '$dtss/Section.svelte';
	import { formatUSPhoneForDisplay } from '$lib/_helpers/phone';
	import ToneBadge from '../ToneBadge.svelte';
	import { joinAddress } from '../../people';

	/** Overview tab: contact and billing as FactGrids (replaces the <h3>Email:</h3> rows). */
	let {
		client,
		isAdmin,
		billingMismatchMessage = null,
		onEditProfile,
		onEditBilling
	}: {
		client: any;
		isAdmin: boolean;
		billingMismatchMessage?: string | null;
		onEditProfile?: () => void;
		onEditBilling?: () => void;
	} = $props();

	const company = $derived(client.company ?? {});
	const billingAddress = $derived(
		joinAddress({
			street: company.billingStreetOne,
			street2: company.billingStreetTwo,
			city: company.billingCity,
			state: company.billingState,
			zip: company.billingZipcode
		})
	);

	const contact: Fact[] = $derived([
		{ label: 'Owner', value: `${client.user.firstName ?? ''} ${client.user.lastName ?? ''}`.trim() || '—' },
		{ label: 'Email', cell: emailCell },
		{ label: 'Cell', cell: phoneCell },
		{ label: 'Base location', value: company.baseLocation || 'Not set' },
		{ label: 'Website', cell: websiteCell }
	]);

	const billing: Fact[] = $derived([
		{ label: 'Billing contact', cell: billingContactCell },
		{ label: 'Billing email', cell: billingEmailCell },
		{ label: 'Billing address', cell: billingAddressCell },
		{ label: 'Invoice method', value: client.profile.clientInvoiceMethod === 'PAPER' ? 'Paper' : 'Stripe' }
	]);
</script>

{#snippet emailCell()}
	<span class="flex flex-wrap items-center gap-2 whitespace-normal">
		<a href="mailto:{client.user.email}" class="break-all text-primary-dark hover:underline">{client.user.email}</a>
		{#if !client.user.receiveEmail}<ToneBadge tone="negative" label="Email opted out" hint="Opted out of manual email campaigns. Platform emails still send." />{/if}
		{#if !client.user.receiveSms}<ToneBadge tone="negative" label="SMS opted out" hint="Replied STOP to campaign texts. Platform texts still send." />{/if}
	</span>
{/snippet}

{#snippet phoneCell()}
	{#if client.profile.cellPhone}
		<a href="tel:{client.profile.cellPhone}" class="text-primary-dark hover:underline">{formatUSPhoneForDisplay(client.profile.cellPhone)}</a>
	{:else}Not set{/if}
{/snippet}

{#snippet websiteCell()}
	{#if company.website}
		<a href={company.website} target="_blank" rel="noopener noreferrer" class="block whitespace-normal break-all text-primary-dark hover:underline">{company.website}</a>
	{:else}Not set{/if}
{/snippet}

{#snippet billingContactCell()}
	<span class="block whitespace-normal">{company.billingContactName || `${client.user.firstName ?? ''} ${client.user.lastName ?? ''}`.trim()}</span>
{/snippet}

{#snippet billingEmailCell()}
	<span class="block whitespace-normal break-all">
		{company.billingEmail || client.user.email}
		{#if !company.billingEmail}<span class="font-normal text-muted-foreground">(owner's email)</span>{/if}
	</span>
{/snippet}

{#snippet billingAddressCell()}
	<span class="block whitespace-normal">
		{#if billingAddress}{billingAddress}{:else}<span class="font-normal text-muted-foreground">Not set, uses the primary office</span>{/if}
	</span>
{/snippet}

<div class="space-y-6">
	<Section title="Practice & owner">
		{#snippet actions()}
			{#if isAdmin && onEditProfile}
				<Button variant="outline" size="sm" class="gap-2" aria-label="Edit practice and owner" on:click={onEditProfile}><Pencil class="size-4" aria-hidden="true" />Edit</Button>
			{/if}
		{/snippet}
		<FactGrid facts={contact} columns={3} />
	</Section>

	<Section title="Billing">
		{#snippet actions()}
			{#if isAdmin && onEditBilling}
				<Button variant="outline" size="sm" class="gap-2" aria-label="Edit billing" on:click={onEditBilling}><Pencil class="size-4" aria-hidden="true" />Edit</Button>
			{/if}
		{/snippet}
		<div class="space-y-4">
			<FactGrid facts={billing} columns={2} />
			{#if billingMismatchMessage}
				<!-- PAPER with an unused Stripe customer: nothing is broken, but every invoice
				     (approved timesheets included) bills as paper until this changes. -->
				<Notice tone="warning">{billingMismatchMessage}</Notice>
			{/if}
		</div>
	</Section>
</div>
