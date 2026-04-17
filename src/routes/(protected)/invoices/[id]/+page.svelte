<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import * as Avatar from '$lib/components/ui/avatar';
	import { Badge } from '$lib/components/ui/badge';
	import * as Table from '$lib/components/ui/table';
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';
	import {
		Download,
		Calendar,
		User,
		Building,
		CreditCard,
		Clock,
		FileText,
		DollarSign,
		AlertCircle,
		CheckCircle,
		XCircle,
		Pause
	} from 'lucide-svelte';
	import { USER_ROLES } from '$lib/config/constants';
	import type { InvoiceWithRelations } from '$lib/server/database/schemas/requisition';
	import type { PageData } from './$types';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { Loader2 } from 'lucide-svelte';
	import * as Select from '$lib/components/ui/select';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';

	export let data: PageData;
	let recordTransactionOpen = false;
	let transactionAmount = '';
	let transactionType: 'PAYMENT' | 'REFUND' | 'ADJUSTMENT' = 'PAYMENT';
	let batchNumber = '';
	let transactionNotes = '';
	let recordingTransaction = false;

	$: isPaperInvoice = invoiceData.invoice.invoiceType === 'PAPER';
	$: isFullyPaid = invoiceData.invoice.status === 'paid';
	$: amountRemaining = parseFloat(String(invoiceData.invoice.amountRemaining ?? 0));

	$: user = data.user;
	$: invoiceData = data.invoice as InvoiceWithRelations;
	$: isAdmin = user?.role === USER_ROLES.SUPERADMIN;

	$: console.log(user.role, 'isAdmin:', isAdmin);
	$: isOverdue = invoiceData.invoice.dueDate
		? new Date(invoiceData.invoice.dueDate) < new Date() && invoiceData.invoice.status !== 'paid'
		: false;

	// Helper functions
	function formatCurrency(amount: number) {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD'
		}).format(amount);
	}

	function formatDate(date: string | Date) {
		return new Date(date).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
	}

	function formatDateTime(date: string | Date) {
		return new Date(date).toLocaleString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function getStatusIcon(status: string) {
		switch (status) {
			case 'PAID':
				return CheckCircle;
			case 'PENDING':
				return Clock;
			case 'OVERDUE':
				return AlertCircle;
			case 'CANCELLED':
				return XCircle;
			case 'DRAFT':
				return Pause;
			default:
				return FileText;
		}
	}

	function getStatusVariant(status: string) {
		switch (status) {
			case 'PAID':
				return 'default';
			case 'PENDING':
				return 'secondary';
			case 'OVERDUE':
				return 'destructive';
			case 'CANCELLED':
				return 'outline';
			case 'DRAFT':
				return 'outline';
			default:
				return 'secondary';
		}
	}

	function calculateSubtotal() {
		return invoiceData.lineItems.reduce((sum, item) => sum + (item.amount / 100 || 0), 0);
	}

	function calculateTax() {
		return invoiceData.invoice.taxAmount || 0;
	}

	function calculateTotal() {
		return invoiceData.invoice.total || 0;
	}
</script>

<svelte:head>
	<title>Invoice #{invoiceData.invoice.invoiceNumber} | DTSS</title>
</svelte:head>

<section class="container mx-auto p-6 space-y-6">
	<!-- Header -->
	<div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
		<div class="space-y-1">
			<div class="flex items-center gap-3">
				<h1 class="text-3xl font-bold tracking-tight">
					Invoice #{invoiceData.invoice.invoiceNumber}
				</h1>
				<Badge
					variant={getStatusVariant(invoiceData.invoice.status)}
					value={invoiceData.invoice.status}
				>
					<svelte:component this={getStatusIcon(invoiceData.invoice.status)} class="h-3 w-3 mr-1" />
				</Badge>
				{#if isPaperInvoice}
					<Badge variant="outline" class="border-blue-300 text-blue-700" value="Paper Invoice" />
				{/if}
			</div>
			<p class="text-muted-foreground">
				{#if isAdmin}
					Client: {invoiceData.clientUser.firstName} {invoiceData.clientUser.lastName}
				{:else}
					Invoice details and payment information
				{/if}
			</p>
		</div>

		<div class="flex items-center gap-2 flex-wrap">
			{#if !isAdmin && invoiceData.invoice.status === 'open' && !isPaperInvoice}
				<Button size="sm" href={invoiceData.invoice.stripeHostedUrl} class="w-full sm:w-fit">
					<CreditCard class="h-4 w-4 mr-2" />
					Pay Invoice
				</Button>
			{/if}

			{#if isAdmin && !isPaperInvoice && isOverdue}
				<form use:enhance action="?/adminProcessInvoice" method="POST">
					<Button type="submit" size="sm" class="w-full sm:w-fit">
						<CreditCard class="h-4 w-4 mr-2" />
						Process Payment
					</Button>
				</form>
			{/if}

			{#if isAdmin && isPaperInvoice && !isFullyPaid}
				<Button
					size="sm"
					class="w-full sm:w-fit bg-blue-800 hover:bg-blue-900"
					on:click={() => (recordTransactionOpen = true)}
				>
					<CreditCard class="h-4 w-4 mr-2" />
					Record Transaction
				</Button>
			{/if}

			{#if !isPaperInvoice && invoiceData.invoice.stripePdfUrl}
				<Button
					href={invoiceData.invoice.stripePdfUrl}
					variant="outline"
					size="sm"
					class="w-full sm:w-fit"
				>
					<Download class="h-4 w-4 mr-2" />
					Download PDF
				</Button>
			{/if}
		</div>
	</div>

	<div class="grid gap-6 lg:grid-cols-3">
		<!-- Main Content -->
		<div class="lg:col-span-2 space-y-6">
			<!-- Invoice Details Card -->
			<Card.Root>
				<Card.Header>
					<Card.Title class="flex items-center gap-2">
						<FileText class="h-5 w-5" />
						Invoice Details
					</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-4">
					<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div class="space-y-2">
							<p class="text-sm font-medium text-muted-foreground">Invoice Date</p>
							<p class="flex items-center gap-2">
								<Calendar class="h-4 w-4" />
								{formatDate(invoiceData.invoice.createdAt)}
							</p>
						</div>
						<div class="space-y-2">
							<p class="text-sm font-medium text-muted-foreground">Due Date</p>
							<p class="flex items-center gap-2">
								<Calendar class="h-4 w-4" />
								{invoiceData.invoice.dueDate ? formatDate(invoiceData.invoice.dueDate) : 'Not set'}
							</p>
						</div>
						{#if invoiceData.requisition}
							<div class="space-y-2">
								<p class="text-sm font-medium text-muted-foreground">Requisition</p>
								<p class="flex items-center gap-2">
									<Building class="h-4 w-4" />
									<a
										href="/requisitions/{invoiceData.requisition.id}"
										class="text-primary hover:underline"
									>
										#{invoiceData.requisition.id}
									</a>
								</p>
							</div>
						{/if}
						{#if invoiceData.timesheet}
							<div class="space-y-2">
								<p class="text-sm font-medium text-muted-foreground">Timesheet</p>
								<p class="flex items-center gap-2">
									<Clock class="h-4 w-4" />
									<a
										href="/timesheets/{invoiceData.timesheet.id}"
										class="text-primary hover:underline"
									>
										#{invoiceData.timesheet.id}
									</a>
								</p>
							</div>
						{/if}
					</div>

					{#if invoiceData.invoice.description}
						<div class="space-y-2">
							<p class="text-sm font-medium text-muted-foreground">Description</p>
							<p class="text-sm">{invoiceData.invoice.description}</p>
						</div>
					{/if}
				</Card.Content>
			</Card.Root>

			<!-- Line Items -->
			<Card.Root>
				<Card.Header>
					<Card.Title class="flex items-center gap-2">
						<DollarSign class="h-5 w-5" />
						Line Items
					</Card.Title>
				</Card.Header>
				<Card.Content>
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head>Description</Table.Head>
								<Table.Head class="text-right">Quantity</Table.Head>
								<Table.Head class="text-right">Rate</Table.Head>
								<Table.Head class="text-right">Amount</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each invoiceData.lineItems as item}
								<Table.Row>
									<Table.Cell>
										<div class="space-y-1">
											<p class="font-medium">{item.description || 'Service'}</p>
											<!-- {#if item.details}
												<p class="text-sm text-muted-foreground">{item.details}</p>
											{/if} -->
										</div>
									</Table.Cell>
									<Table.Cell class="text-right">
										{item.quantity || 1}
									</Table.Cell>
									<Table.Cell class="text-right">
										{formatCurrency(Number(item.unit_amount_excluding_tax || 0) / 100)}
									</Table.Cell>
									<Table.Cell class="text-right font-medium">
										{formatCurrency(Number(+item.amount.toFixed(2) / 100) || 0)}
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>

					<Separator class="my-4" />

					<!-- Totals -->
					<div class="space-y-2">
						<div class="flex justify-between text-sm">
							<span>Subtotal</span>
							<span>{formatCurrency(calculateSubtotal())}</span>
						</div>
						{#if +calculateTax() > 0}
							<div class="flex justify-between text-sm">
								<span>Tax</span>
								<span>{formatCurrency(+calculateTax())}</span>
							</div>
						{/if}
						<Separator />
						<div class="flex justify-between text-lg font-semibold">
							<span>Total</span>
							<span>{formatCurrency(+calculateTotal())}</span>
						</div>
						{#if isPaperInvoice && parseFloat(String(invoiceData.invoice.amountPaid ?? 0)) > 0}
							<div class="flex justify-between text-sm text-green-600">
								<span>Amount Paid</span>
								<span
									>{formatCurrency(parseFloat(String(invoiceData.invoice.amountPaid ?? 0)))}</span
								>
							</div>
							<div class="flex justify-between text-sm font-semibold text-red-600">
								<span>Balance Remaining</span>
								<span>{formatCurrency(amountRemaining)}</span>
							</div>
						{/if}
					</div>
				</Card.Content>
			</Card.Root>

			{#if isAdmin}
				<Card.Root>
					<Card.Header>
						<Card.Title class="flex items-center gap-2">
							<CreditCard class="h-5 w-5" />
							Payment History
						</Card.Title>
					</Card.Header>
					<Card.Content>
						{#if isPaperInvoice}
							{#if invoiceData.invoice.amountPaid && parseFloat(String(invoiceData.invoice.amountPaid)) > 0}
								<div class="space-y-2">
									<div class="flex items-center justify-between p-3 border rounded-lg">
										<div class="flex items-center gap-3">
											<CheckCircle class="h-5 w-5 text-green-600" />
											<div>
												<p class="font-medium">Total Paid</p>
												<p class="text-sm text-muted-foreground">Via paper transactions</p>
											</div>
										</div>
										<p class="font-medium text-green-600">
											{formatCurrency(parseFloat(String(invoiceData.invoice.amountPaid)))}
										</p>
									</div>
									{#if amountRemaining > 0}
										<div
											class="flex items-center justify-between p-3 border border-orange-200 bg-orange-50 rounded-lg"
										>
											<p class="text-sm font-medium text-orange-700">Balance Remaining</p>
											<p class="font-medium text-orange-700">{formatCurrency(amountRemaining)}</p>
										</div>
									{/if}
								</div>
							{:else}
								<div class="text-center py-8 text-muted-foreground">
									<CreditCard class="h-8 w-8 mx-auto mb-2 opacity-50" />
									<p>No transactions recorded yet</p>
									{#if !isFullyPaid}
										<Button
											variant="outline"
											size="sm"
											class="mt-4"
											on:click={() => (recordTransactionOpen = true)}
										>
											Record First Transaction
										</Button>
									{/if}
								</div>
							{/if}
						{:else if invoiceData.invoice.paidAt}
							<div class="flex items-center justify-between p-3 border rounded-lg">
								<div class="flex items-center gap-3">
									<CheckCircle class="h-5 w-5 text-green-600" />
									<div>
										<p class="font-medium">Payment Received</p>
										<p class="text-sm text-muted-foreground">
											{formatDateTime(invoiceData.invoice.paidAt)}
										</p>
									</div>
								</div>
								<div class="text-right">
									<p class="font-medium">{formatCurrency(+calculateTotal())}</p>
									<p class="text-sm text-muted-foreground">Full payment</p>
								</div>
							</div>
						{:else}
							<div class="text-center py-8 text-muted-foreground">
								<CreditCard class="h-8 w-8 mx-auto mb-2 opacity-50" />
								<p>No payments recorded</p>
							</div>
						{/if}
					</Card.Content>
				</Card.Root>
			{/if}
		</div>

		<!-- Sidebar -->
		<div class="space-y-6">
			<!-- Client Information -->
			<Card.Root>
				<Card.Header>
					<Card.Title class="flex items-center gap-2">
						<Building class="h-5 w-5" />
						{isAdmin ? 'Client' : 'Bill To'}
					</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-4">
					<div class="flex items-start gap-3">
						<Avatar.Root class="h-12 w-12">
							<Avatar.Image
								src={invoiceData.clientUser.avatarUrl}
								alt={invoiceData.clientUser.firstName}
							/>
							<Avatar.Fallback>
								{invoiceData.clientUser.firstName?.[0]}{invoiceData.clientUser.lastName?.[0]}
							</Avatar.Fallback>
						</Avatar.Root>
						<div class="space-y-1">
							<p class="font-medium">
								{invoiceData.clientUser.firstName}
								{invoiceData.clientUser.lastName}
							</p>
							<Button
								variant="link"
								href={`/clients/${invoiceData.client.id}`}
								class="text-sm text-muted-foreground p-0 h-fit"
							>
								{invoiceData.company?.companyName || 'Client'}
							</Button>
							<!-- {#if invoiceData.clientUser.email}
								<p class="text-sm text-muted-foreground">
									{invoiceData.clientUser.email}
								</p>
							{/if} -->
						</div>
					</div>
				</Card.Content>
			</Card.Root>

			{#if invoiceData.candidate}
				<!-- Candidate Information -->
				<Card.Root>
					<Card.Header>
						<Card.Title class="flex items-center gap-2">
							<User class="h-5 w-5" />
							Candidate
						</Card.Title>
					</Card.Header>
					<Card.Content class="space-y-4">
						<div class="flex items-start gap-3">
							<Avatar.Root class="h-12 w-12">
								<Avatar.Image
									src={invoiceData.candidate.user.avatarUrl}
									alt={invoiceData.candidate.user.firstName}
								/>
								<Avatar.Fallback>
									{invoiceData.candidate.user.firstName?.[0]}{invoiceData.candidate.user
										.lastName?.[0]}
								</Avatar.Fallback>
							</Avatar.Root>
							<div class="space-y-1">
								<p class="font-medium">
									{invoiceData.candidate.user.firstName}
									{invoiceData.candidate.user.lastName}
								</p>
								<p class="text-sm text-muted-foreground">Healthcare Professional</p>
								<!-- {#if isAdmin && invoiceData.candidate.profile.email}
									<p class="text-sm text-muted-foreground">
										{invoiceData.candidate.profile.email}
									</p>
								{/if} -->
							</div>
						</div>
					</Card.Content>
				</Card.Root>
			{/if}

			<!-- Quick Actions -->
			<!-- <Card.Root>
				<Card.Header>
					<Card.Title>Quick Actions</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-2">
					<Button
						href={invoiceData.invoice.stripePdfUrl}
						variant="outline"
						class="w-full justify-start"
					>
						<Download class="h-4 w-4 mr-2" />
						Download PDF
					</Button>
					{#if !isAdmin && invoiceData.invoice.status === 'open'}
						<Button href={invoiceData.invoice.stripeHostedUrl} class="w-full justify-start">
							<CreditCard class="h-4 w-4 mr-2" />
							Pay Invoice
						</Button>
					{/if}
					{#if isAdmin}
						<Button variant="outline" class="w-full justify-start"> 
							<Mail class="h-4 w-4 mr-2" />
							Send to Client
						</Button>
						{#if invoiceData.invoice.status === 'open'}
							<Button variant="outline" class="w-full justify-start">
								<CheckCircle class="h-4 w-4 mr-2" />
								Mark as Paid
							</Button>
						{/if}
					{/if}
				</Card.Content>
			</Card.Root> -->

			{#if isAdmin}
				<!-- Admin: Invoice Metadata -->
				<Card.Root>
					<Card.Header>
						<Card.Title>Metadata</Card.Title>
					</Card.Header>
					<Card.Content class="space-y-3 text-sm">
						<div class="flex justify-between">
							<span class="text-muted-foreground">Created</span>
							<span>{formatDateTime(invoiceData.invoice.createdAt)}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-muted-foreground">Updated</span>
							<span>{formatDateTime(invoiceData.invoice.updatedAt)}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-muted-foreground">Source</span>
							<span class="capitalize">{invoiceData.invoice.sourceType || 'Manual'}</span>
						</div>
						{#if invoiceData.invoice.stripeInvoiceId}
							<div class="flex justify-between">
								<span class="text-muted-foreground">Stripe ID</span>
								<span class="font-mono text-xs">{invoiceData.invoice.stripeInvoiceId}</span>
							</div>
						{/if}
					</Card.Content>
				</Card.Root>
			{/if}
		</div>
	</div>
</section>
{#if isAdmin}
	<Dialog.Root bind:open={recordTransactionOpen}>
		<Dialog.DialogContent class="sm:max-w-[425px]">
			<form
				method="POST"
				action="?/recordPaperTransaction"
				use:enhance={() => {
					recordingTransaction = true;
					return async ({ result, update }) => {
						recordingTransaction = false;
						if (result.type === 'success') {
							recordTransactionOpen = false;
							transactionAmount = '';
							batchNumber = '';
							transactionNotes = '';
							await invalidateAll();
						}
						await update();
					};
				}}
			>
				<Dialog.DialogHeader>
					<Dialog.DialogTitle>Record Paper Transaction</Dialog.DialogTitle>
					<Dialog.DialogDescription>
						Record a manual payment against invoice #{invoiceData.invoice.invoiceNumber}. Balance
						remaining: {formatCurrency(amountRemaining)}
					</Dialog.DialogDescription>
				</Dialog.DialogHeader>

				<input type="hidden" name="invoiceId" value={invoiceData.invoice.id} />

				<div class="space-y-4 py-4">
					<div class="space-y-2">
						<Label for="transactionType">Transaction Type</Label>
						<Select.Root
							selected={{ value: transactionType, label: transactionType }}
							onSelectedChange={(v) => {
								if (v) transactionType = v.value;
							}}
						>
							<Select.Trigger>
								<Select.Value placeholder="Select type" />
							</Select.Trigger>
							<Select.Content>
								<Select.Item value="PAYMENT">Payment</Select.Item>
								<Select.Item value="REFUND">Refund</Select.Item>
								<Select.Item value="ADJUSTMENT">Adjustment</Select.Item>
							</Select.Content>
						</Select.Root>
						<input type="hidden" name="transactionType" value={transactionType} />
					</div>

					<div class="space-y-2">
						<Label for="amount">Amount</Label>
						<div class="relative">
							<span class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
							<Input
								id="amount"
								name="amount"
								type="number"
								step="0.01"
								min="0.01"
								max={amountRemaining}
								bind:value={transactionAmount}
								class="pl-7"
								placeholder="0.00"
								required
							/>
						</div>
						{#if parseFloat(transactionAmount) > amountRemaining && transactionType === 'PAYMENT'}
							<p class="text-xs text-orange-600">
								Amount exceeds remaining balance of {formatCurrency(amountRemaining)}
							</p>
						{/if}
					</div>

					<div class="space-y-2">
						<Label for="batchNumber"
							>Batch / Check Number <span class="text-muted-foreground text-xs">(optional)</span
							></Label
						>
						<Input
							id="batchNumber"
							name="batchNumber"
							bind:value={batchNumber}
							placeholder="e.g. CHK-1042"
						/>
					</div>

					<div class="space-y-2">
						<Label for="notes"
							>Notes <span class="text-muted-foreground text-xs">(optional)</span></Label
						>
						<Textarea
							id="notes"
							name="notes"
							bind:value={transactionNotes}
							placeholder="Any additional notes about this transaction"
							rows={2}
						/>
					</div>
				</div>

				<Dialog.DialogFooter>
					<Button
						type="button"
						variant="outline"
						on:click={() => (recordTransactionOpen = false)}
						disabled={recordingTransaction}
					>
						Cancel
					</Button>
					<Button type="submit" disabled={recordingTransaction || !transactionAmount}>
						{#if recordingTransaction}
							<Loader2 class="mr-2 h-4 w-4 animate-spin" />
						{/if}
						Record Transaction
					</Button>
				</Dialog.DialogFooter>
			</form>
		</Dialog.DialogContent>
	</Dialog.Root>
{/if}
