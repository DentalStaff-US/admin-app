<script lang="ts">
	/**
	 * Expenses & incidentals. Admins add (Dialog) and delete (typed DELETE: it's
	 * a hard delete); admins and practices approve or reject pending ones. Each
	 * of those moves money on the invoice, so each is confirmed.
	 */
	import { Check, Plus, Receipt, Trash2, X } from 'lucide-svelte';
	import { untrack } from 'svelte';
	import { superForm } from 'sveltekit-superforms/client';
	import ConfirmDialog from '$dtss/ConfirmDialog.svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import Section from '$dtss/Section.svelte';
	import StatusBadge from '$dtss/StatusBadge.svelte';
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import ActionConfirmDialog from './ActionConfirmDialog.svelte';
	import FormDialog from './FormDialog.svelte';
	import { usd } from '../timesheets';

	type Expense = {
		id: string;
		description: string;
		amountCents: number;
		status: 'PENDING' | 'APPROVED' | 'REJECTED' | string;
		rejectionReason: string | null;
		createdAt: Date | string;
	};

	let {
		expenses,
		addExpenseForm,
		admin = false,
		locked = false,
		professional
	}: {
		expenses: Expense[];
		/** The superValidate'd add-expense form from the load (admin only uses it). */
		addExpenseForm: any;
		admin?: boolean;
		/** Approved or voided: nothing can change. */
		locked?: boolean;
		professional: string;
	} = $props();

	let addOpen = $state(false);
	const {
		enhance: addEnhance,
		form: addData,
		submitting: addSubmitting
	} = superForm(untrack(() => addExpenseForm), {
		resetForm: true,
		taintedMessage: null,
		onResult: ({ result }) => {
			if (result.type === 'success') addOpen = false;
		}
	});

	let approving = $state<Expense | null>(null);
	let approveOpen = $state(false);
	let rejecting = $state<Expense | null>(null);
	let rejectOpen = $state(false);
	let deleting = $state<Expense | null>(null);
	let deleteOpen = $state(false);
	let deleteBusy = $state(false);

	const what = (e: Expense | null) => (e ? `${e.description} (${usd(e.amountCents / 100)})` : '');
	const canReview = $derived(!locked);
</script>

{#snippet addAction()}
	{#if admin && !locked}
		<Button variant="outline" size="sm" on:click={() => (addOpen = true)}>
			<Plus class="mr-1.5 size-4" aria-hidden="true" /> Add expense
		</Button>
	{/if}
{/snippet}

<Section
	title="Expenses"
	description="Reimbursements submitted with this timesheet. Approved ones are added to the invoice as their own line items."
	actions={addAction}
	flush
>
	{#if expenses.length === 0}
		<div class="p-4 sm:p-6">
			<EmptyState icon={Receipt} title="No expenses" description="Nothing has been submitted for this timesheet." />
		</div>
	{:else}
		<ul class="divide-y">
			{#each expenses as expense (expense.id)}
				<li class="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 sm:px-6">
					<div class="min-w-0 flex-1 basis-48">
						<p class="truncate font-semibold">{expense.description}</p>
						{#if expense.status === 'REJECTED' && expense.rejectionReason}
							<p class="text-sm text-status-negative-fg">Rejected: {expense.rejectionReason}</p>
						{/if}
					</div>
					<p class="ml-auto font-semibold tabular-nums">{usd(expense.amountCents / 100)}</p>
					<StatusBadge status={expense.status} />
					{#if expense.status === 'PENDING' && canReview}
						<div class="flex w-full gap-2 sm:w-auto">
							<Button size="sm" variant="outline" class="flex-1 sm:flex-none" on:click={() => {
									approving = expense;
									approveOpen = true;
								}}>
								<Check class="mr-1 size-4" aria-hidden="true" /> Approve
							</Button>
							<Button size="sm" variant="destructiveOutline" class="flex-1 sm:flex-none" on:click={() => {
									rejecting = expense;
									rejectOpen = true;
								}}>
								<X class="mr-1 size-4" aria-hidden="true" /> Reject
							</Button>
							{#if admin}
								<Button
									size="icon"
									variant="ghost"
									class="size-9"
									aria-label="Delete expense {expense.description}"
									on:click={() => {
										deleting = expense;
										deleteOpen = true;
									}}
								>
									<Trash2 class="size-4 text-destructive" aria-hidden="true" />
								</Button>
							{/if}
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</Section>

{#if admin}
	<FormDialog
		bind:open={addOpen}
		title="Add an expense"
		description="Added as pending for {professional}. It reaches the invoice once approved."
		action="?/addExpense"
		submitLabel="Add expense"
		formEnhance={addEnhance}
		busy={$addSubmitting}
	>
		<div class="space-y-2">
			<Label for="expense-description">Description</Label>
			<Input id="expense-description" name="description" bind:value={$addData.description} placeholder="Parking, supplies, mileage" required />
		</div>
		<div class="space-y-2">
			<Label for="expense-amount">Amount ($)</Label>
			<Input id="expense-amount" name="amountDollars" type="number" step="0.01" min="0.01" inputmode="decimal" bind:value={$addData.amountDollars} placeholder="0.00" required />
		</div>
	</FormDialog>

	<ConfirmDialog
		bind:open={deleteOpen}
		title="Delete this expense?"
		description="{what(deleting)} is removed from the timesheet for good. This can't be undone."
		confirmText="DELETE"
	>
		{#snippet confirm({ ready, typed })}
			<form
				method="POST"
				action="?/deleteExpense"
				use:enhance={() => {
					deleteBusy = true;
					return async ({ result, update }) => {
						deleteBusy = false;
						if (result.type === 'success') deleteOpen = false;
						await update();
					};
				}}
			>
				<input type="hidden" name="expenseId" value={deleting?.id ?? ''} />
				<input type="hidden" name="confirm" value={typed} />
				<Button type="submit" variant="destructive" class="min-h-11 w-full sm:min-h-10" disabled={!ready || deleteBusy}>Delete expense</Button>
			</form>
		{/snippet}
	</ConfirmDialog>
{/if}

<ActionConfirmDialog
	bind:open={approveOpen}
	title="Approve this expense?"
	description="{what(approving)} is added to the invoice as its own line item."
	action="?/approveExpense"
	confirmLabel="Approve expense"
	tone="success"
	hidden={{ expenseId: approving?.id ?? '' }}
/>

<ActionConfirmDialog
	bind:open={rejectOpen}
	title="Reject this expense?"
	description="{what(rejecting)} won't be billed. {professional} sees your reason."
	action="?/rejectExpense"
	confirmLabel="Reject expense"
	tone="destructive"
	hidden={{ expenseId: rejecting?.id ?? '' }}
	reason={{ name: 'reason', label: 'Reason', placeholder: 'Why is this expense being rejected?', required: true }}
/>
