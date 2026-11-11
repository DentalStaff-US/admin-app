<script lang="ts">
	import type { SuperValidated } from 'sveltekit-superforms';
	import { superForm } from 'sveltekit-superforms/client';
	import { Plus, Trash2 } from 'lucide-svelte';
	import * as Select from '$lib/components/ui/select';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import FormSheet from '$dtss/FormSheet.svelte';
	import Notice from '$dtss/Notice.svelte';

	/**
	 * quantity and rate stay as typed (strings): the action's LineItemSchema
	 * parses `rate` with z.string(), as the old untyped input binding posted it.
	 */
	type Item = { description: string; quantity: string; rate: string; amount: number };
	type PermanentReq = { id: number; title: string | null; status: string };

	const METHODS = [
		{ value: 'STRIPE', label: 'Electronic (Stripe)' },
		{ value: 'PAPER', label: 'Paper invoice' }
	];

	/**
	 * One-off invoice for a practice: line items plus method, due date and an
	 * optional permanent requisition it pays for. A long form, so a FormSheet.
	 * Posts to the existing `createInvoice` action exactly as before (items as
	 * JSON and the total, set at submit time).
	 */
	let {
		open = $bindable(false),
		form,
		defaultMethod,
		permanentRequisitions = [],
		billingMismatch = false,
		action = '?/createInvoice'
	}: {
		open?: boolean;
		form: SuperValidated<any>;
		defaultMethod: 'STRIPE' | 'PAPER';
		permanentRequisitions?: PermanentReq[];
		billingMismatch?: boolean;
		action?: string;
	} = $props();

	const blank = (): Item => ({ description: '', quantity: '1', rate: '0', amount: 0 });
	let items = $state<Item[]>([blank()]);
	// svelte-ignore state_referenced_locally
	let method = $state<'STRIPE' | 'PAPER'>(defaultMethod);
	/** '' means "not tied to a requisition"; the server preprocesses it to undefined. */
	let requisitionId = $state('');

	const total = $derived(items.reduce((t, i) => t + (i.amount || 0), 0));

	// svelte-ignore state_referenced_locally
	const sf = superForm(form, {
		id: 'client-invoice',
		resetForm: true,
		taintedMessage: null,
		onSubmit: ({ formData }) => {
			// Sync the items into the post at submit time.
			formData.set('items', JSON.stringify(items));
			formData.set('amount', String(total));
			formData.set('invoiceMethod', method);
			formData.set('requisitionId', requisitionId);
		},
		onResult: ({ result }) => {
			if (result.type === 'success') {
				open = false;
				items = [blank()];
				requisitionId = '';
			}
		}
	});
	const { form: values, errors, submitting, enhance } = sf;

	// The next invoice must not silently inherit the last one's requisition.
	$effect(() => {
		if (!open) requisitionId = '';
	});

	function reqLabel(r: PermanentReq) {
		const name = r.title?.trim() ? r.title : 'Permanent position';
		// PAYMENT_REQUIRED is the state an admin is normally here to clear.
		return `Req #${r.id} — ${name}${r.status === 'PAYMENT_REQUIRED' ? ' · awaiting payment' : ''}`;
	}

	function setItem(i: number, key: keyof Item, raw: string) {
		const next = [...items];
		const item = { ...next[i], [key]: raw };
		item.amount = (parseFloat(item.quantity) || 0) * (parseFloat(item.rate) || 0);
		next[i] = item;
		items = next;
	}

	const dirty = $derived(total > 0 || items.some((i) => i.description.trim()) || Boolean($values.description));
	const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
	const selectedReq = $derived(permanentRequisitions.find((r) => String(r.id) === requisitionId));
</script>

<FormSheet bind:open title="New one-off invoice" description="A custom invoice for this practice." {dirty}>
	<form method="POST" {action} id="client-invoice-form" use:enhance class="space-y-6">
		<input type="hidden" name="items" value={JSON.stringify(items)} />
		<input type="hidden" name="amount" value={total} />
		<input type="hidden" name="invoiceMethod" value={method} />
		<input type="hidden" name="requisitionId" value={requisitionId} />

		<div class="grid gap-4 sm:grid-cols-2">
			<div class="space-y-1.5">
				<Label for="invoice-due">Due date</Label>
				<Input id="invoice-due" name="dueDate" type="date" bind:value={$values.dueDate} />
				{#if $errors.dueDate}<p class="text-sm text-destructive">{$errors.dueDate}</p>{/if}
			</div>
			<div class="space-y-1.5">
				<Label for="invoice-method">Invoice method</Label>
				<Select.Root
					selected={METHODS.find((m) => m.value === method)}
					onSelectedChange={(v) => v && (method = v.value as 'STRIPE' | 'PAPER')}
				>
					<Select.Trigger id="invoice-method"><Select.Value /></Select.Trigger>
					<Select.Content>
						{#each METHODS as m (m.value)}<Select.Item value={m.value}>{m.label}</Select.Item>{/each}
					</Select.Content>
				</Select.Root>
			</div>
		</div>
		{#if method === 'PAPER'}
			<Notice tone={billingMismatch ? 'warning' : 'info'}>
				A paper invoice is created and tracked by hand; nothing is charged through Stripe.
				{#if billingMismatch}This practice has a Stripe customer on file: switch to Electronic if it should be billed electronically.{/if}
			</Notice>
		{/if}

		{#if permanentRequisitions.length > 0}
			<div class="space-y-1.5">
				<Label for="invoice-req">Bill against a permanent requisition (optional)</Label>
				<Select.Root
					selected={selectedReq ? { value: String(selectedReq.id), label: reqLabel(selectedReq) } : { value: '', label: 'Not tied to a requisition' }}
					onSelectedChange={(v) => (requisitionId = String(v?.value ?? ''))}
				>
					<Select.Trigger id="invoice-req"><Select.Value /></Select.Trigger>
					<Select.Content>
						<Select.Item value="">Not tied to a requisition</Select.Item>
						{#each permanentRequisitions as r (r.id)}<Select.Item value={String(r.id)}>{reqLabel(r)}</Select.Item>{/each}
					</Select.Content>
				</Select.Root>
				<p class="text-sm text-muted-foreground">Links the invoice to the placement it pays for, so the requisition stops reading as unbilled.</p>
			</div>
		{/if}

		<fieldset class="space-y-3">
			<div class="flex items-center justify-between">
				<legend class="text-sm font-semibold">Line items</legend>
				<Button variant="outline" size="sm" class="gap-2" on:click={() => (items = [...items, blank()])}>
					<Plus class="size-4" aria-hidden="true" />Add item
				</Button>
			</div>
			<ul class="divide-y rounded-lg border">
				{#each items as item, i (i)}
					<li class="grid gap-3 p-3 sm:grid-cols-[1fr_5rem_6rem_auto] sm:items-end">
						<div class="space-y-1.5">
							<Label for="item-desc-{i}" class="sm:sr-only">Description</Label>
							<Input id="item-desc-{i}" placeholder="Item description" value={item.description} on:input={(e) => setItem(i, 'description', e.currentTarget.value)} />
						</div>
						<div class="space-y-1.5">
							<Label for="item-qty-{i}" class="text-xs">Qty</Label>
							<Input id="item-qty-{i}" type="number" min="0" step="any" class="tabular-nums" value={item.quantity} on:input={(e) => setItem(i, 'quantity', e.currentTarget.value)} />
						</div>
						<div class="space-y-1.5">
							<Label for="item-rate-{i}" class="text-xs">Rate ($)</Label>
							<Input id="item-rate-{i}" type="number" min="0" step="0.01" class="tabular-nums" value={item.rate} on:input={(e) => setItem(i, 'rate', e.currentTarget.value)} />
						</div>
						<div class="flex items-center justify-between gap-2 sm:justify-end">
							<span class="font-bold tabular-nums">{money(item.amount || 0)}</span>
							<Button variant="ghost" size="icon" class="size-9" aria-label="Remove item {i + 1}" disabled={items.length <= 1} on:click={() => (items = items.filter((_, j) => j !== i))}>
								<Trash2 class="size-4" aria-hidden="true" />
							</Button>
						</div>
					</li>
				{/each}
				<li class="flex justify-between bg-muted/50 p-3 font-bold">
					<span>Total</span>
					<span class="tabular-nums">{money(total)}</span>
				</li>
			</ul>
			{#if $errors.items}<p class="text-sm text-destructive">{$errors.items}</p>{/if}
		</fieldset>

		<div class="space-y-1.5">
			<Label for="invoice-notes">Additional notes</Label>
			<Textarea id="invoice-notes" name="description" bind:value={$values.description} placeholder="Anything the practice should know" />
			{#if $errors.description}<p class="text-sm text-destructive">{$errors.description}</p>{/if}
		</div>
		{#if $errors._errors?.length}<Notice tone="negative" alert>{$errors._errors[0]}</Notice>{/if}
	</form>

	{#snippet footer()}
		<Button variant="outline" on:click={() => (open = false)}>Cancel</Button>
		<Button type="submit" form="client-invoice-form" disabled={$submitting}>{$submitting ? 'Creating…' : 'Create invoice'}</Button>
	{/snippet}
</FormSheet>
