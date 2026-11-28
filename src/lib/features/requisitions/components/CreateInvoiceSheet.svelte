<script lang="ts">
	import { Plus, Trash2 } from 'lucide-svelte';
	import { superForm } from 'sveltekit-superforms/client';
	import type { SuperValidated } from 'sveltekit-superforms';
	import FormSheet from '$dtss/FormSheet.svelte';
	import Notice from '$dtss/Notice.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import { Textarea } from '$lib/components/ui/textarea';

	type Method = 'STRIPE' | 'PAPER';
	type Item = { description: string; quantity: number; rate: number; amount: number };

	let {
		open = $bindable(false),
		invoiceForm,
		requisitionId,
		label,
		clientInvoiceMethod = 'STRIPE',
		billingMismatchMessage = null
	}: {
		open?: boolean;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		invoiceForm: SuperValidated<any>;
		requisitionId: number | string;
		/** What the request is, e.g. "Dental Hygienist". */
		label: string;
		clientInvoiceMethod?: Method | string | null;
		billingMismatchMessage?: string | null;
	} = $props();

	const blankItem = (): Item => ({ description: '', quantity: 1, rate: 0, amount: 0 });
	// Default to however the client is set up to be billed, so admins on a
	// Stripe-billed client don't have to flip from PAPER every time.
	const defaultMethod = (): Method => (clientInvoiceMethod === 'PAPER' ? 'PAPER' : 'STRIPE');

	let items = $state<Item[]>([blankItem()]);
	let method = $state<Method>(defaultMethod());

	const {
		form,
		enhance,
		submitting,
		errors
	} = superForm(invoiceForm, {
		dataType: 'json',
		// The sheet asks before discarding; the computed fields shouldn't block leaving the page.
		taintedMessage: null,
		onResult({ result }) {
			if (result.type === 'success') {
				open = false;
				reset();
			}
		}
	});

	function reset() {
		items = [blankItem()];
		method = defaultMethod();
		$form.description = '';
		$form.dueDate = '';
	}

	const lineAmount = (i: Item) => (Number(i.quantity) || 0) * (Number(i.rate) || 0);
	const total = $derived(items.reduce((sum, i) => sum + lineAmount(i), 0));

	// Same payload as before: amount, items (JSON string) and invoiceMethod.
	$effect(() => {
		$form.amount = total;
		$form.items = JSON.stringify(
			items.map((i) => ({ description: i.description, quantity: i.quantity, rate: String(i.rate), amount: lineAmount(i) }))
		);
		$form.invoiceMethod = method;
	});

	const dirty = $derived(
		items.length > 1 ||
			items.some((i) => i.description.trim() !== '' || Number(i.rate) !== 0 || Number(i.quantity) !== 1) ||
			!!($form.description ?? '').trim() ||
			!!$form.dueDate
	);

	const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
	const METHOD_LABEL: Record<Method, string> = { PAPER: 'Paper invoice', STRIPE: 'Electronic (Stripe)' };
	const removeItem = (index: number) => (items = items.filter((_, i) => i !== index));
</script>

<FormSheet
	bind:open
	{dirty}
	title="Create invoice"
	description={`Charge the practice for requisition #${requisitionId} (${label}). Use the notes to say what the charges cover.`}
>
	<form id="create-invoice-form" method="POST" action="?/createInvoice" use:enhance class="space-y-6">
		<div class="grid gap-4 sm:grid-cols-2">
			<div class="space-y-1.5">
				<Label for="invoice-due" class="font-semibold">Due date</Label>
				<Input id="invoice-due" name="dueDate" type="date" bind:value={$form.dueDate} />
				{#if $errors.dueDate}<p class="text-sm text-destructive">{$errors.dueDate}</p>{/if}
			</div>
			<div class="space-y-1.5">
				<Label for="invoice-method" class="font-semibold">Invoice method</Label>
				<Select.Root
					selected={{ value: method, label: METHOD_LABEL[method] }}
					onSelectedChange={(v) => {
						if (v?.value === 'PAPER' || v?.value === 'STRIPE') method = v.value;
					}}
				>
					<Select.Trigger id="invoice-method"><Select.Value placeholder="Choose a method" /></Select.Trigger>
					<Select.Content>
						<Select.Item value="PAPER" label={METHOD_LABEL.PAPER}>{METHOD_LABEL.PAPER}</Select.Item>
						<Select.Item value="STRIPE" label={METHOD_LABEL.STRIPE}>{METHOD_LABEL.STRIPE}</Select.Item>
					</Select.Content>
				</Select.Root>
				<input type="hidden" name="invoiceMethod" value={method} />
			</div>
		</div>

		{#if billingMismatchMessage && method === 'PAPER'}
			<!-- The method defaults from the client's stored setting, so a mis-set
			     client silently pre-selects paper. Say so at the moment of choosing. -->
			<Notice tone="info" title="This practice has a Stripe customer">
				They're set to paper invoicing but have a Stripe customer on file. Switch to Electronic (Stripe) if
				this should be billed electronically.
			</Notice>
		{/if}

		<fieldset class="space-y-3">
			<div class="flex items-center justify-between gap-3">
				<legend class="text-h4">Line items</legend>
				<Button type="button" variant="outline" size="sm" class="gap-1" on:click={() => (items = [...items, blankItem()])}>
					<Plus class="size-4" aria-hidden="true" /> Add item
				</Button>
			</div>
			<ul class="divide-y rounded-lg border">
				{#each items as item, i (i)}
					<li class="grid gap-3 p-3 sm:grid-cols-[1fr_5rem_7rem_auto] sm:items-end">
						<div class="space-y-1">
							<Label for={`item-desc-${i}`} class="text-xs text-muted-foreground">Description</Label>
							<Input id={`item-desc-${i}`} bind:value={item.description} placeholder="Placement fee" />
						</div>
						<div class="grid grid-cols-2 gap-3 sm:contents">
							<div class="space-y-1">
								<Label for={`item-qty-${i}`} class="text-xs text-muted-foreground">Qty</Label>
								<Input id={`item-qty-${i}`} type="number" min="0" step="any" class="tabular-nums" bind:value={item.quantity} />
							</div>
							<div class="space-y-1">
								<Label for={`item-rate-${i}`} class="text-xs text-muted-foreground">Rate</Label>
								<div class="relative">
									<span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground" aria-hidden="true">$</span>
									<Input id={`item-rate-${i}`} type="number" min="0" step="0.01" class="pl-6 tabular-nums" bind:value={item.rate} />
								</div>
							</div>
						</div>
						<div class="flex items-center justify-between gap-2 sm:justify-end">
							<span class="text-sm font-semibold tabular-nums sm:w-20 sm:text-right">{money(lineAmount(item))}</span>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								class="size-9 text-muted-foreground hover:text-destructive"
								aria-label={`Remove item ${i + 1}`}
								disabled={items.length <= 1}
								on:click={() => removeItem(i)}
							>
								<Trash2 class="size-4" aria-hidden="true" />
							</Button>
						</div>
					</li>
				{/each}
			</ul>
			<div class="flex items-center justify-end gap-3 text-sm">
				<span class="font-semibold">Total</span>
				<span class="text-lg font-extrabold tabular-nums">{money(total)}</span>
			</div>
			{#if $errors.items}<p class="text-sm text-destructive">{$errors.items}</p>{/if}
		</fieldset>

		<div class="space-y-1.5">
			<Label for="invoice-notes" class="font-semibold">Rationale / notes</Label>
			<Textarea
				id="invoice-notes"
				name="description"
				bind:value={$form.description}
				placeholder="What these charges cover (placement fee, retainer, …)"
				class="min-h-24"
			/>
			{#if $errors.description}<p class="text-sm text-destructive">{$errors.description}</p>{/if}
		</div>

		<input type="hidden" name="items" value={$form.items} />
		<input type="hidden" name="amount" value={$form.amount} />
	</form>

	{#snippet footer()}
		<Button type="button" variant="outline" on:click={() => (open = false)}>Cancel</Button>
		<Button type="submit" form="create-invoice-form" disabled={$submitting}>
			{$submitting ? 'Creating…' : 'Create invoice'}
		</Button>
	{/snippet}
</FormSheet>
