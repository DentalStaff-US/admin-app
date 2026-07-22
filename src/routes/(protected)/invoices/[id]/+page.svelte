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
		Pause,
		ArrowDownCircle,
		Undo2,
		Sliders
	} from 'lucide-svelte';
	import { USER_ROLES } from '$lib/config/constants';
	import { StatusBadge } from '$lib/components/ui/status-badge';
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
	type TransactionType = 'PAYMENT' | 'REFUND' | 'ADJUSTMENT';
	const transactionTypeLabels: Record<TransactionType, string> = {
		PAYMENT: 'Payment',
		REFUND: 'Refund',
		ADJUSTMENT: 'Adjustment'
	};
	let transactionType: TransactionType | '' = '';
	function setTransactionType(value: string) {
		transactionType = value as TransactionType;
	}
	let batchNumber = '';
	let transactionNotes = '';
	let recordingTransaction = false;
	let processingPayment = false;

	// Reverse-payment dialog state
	let reversePaymentOpen = false;
	let reverseAmount = '';
	let reverseReason = '';
	let reversingPayment = false;

	// Void-invoice dialog state
	let voidInvoiceOpen = false;
	let voidReason = '';
	let voidingInvoice = false;

	$: isPaperInvoice = invoiceData.invoice.invoiceType === 'PAPER';
	$: isFullyPaid = invoiceData.invoice.status === 'paid';
	$: isVoided = invoiceData.invoice.status === 'void';
	$: amountRemaining = parseFloat(String(invoiceData.invoice.amountRemaining ?? 0));
	$: amountPaid = parseFloat(String(invoiceData.invoice.amountPaid ?? 0));

	$: user = data.user;
	$: invoiceData = data.invoice as InvoiceWithRelations;
	$: isAdmin = user?.role === USER_ROLES.SUPERADMIN;

	type PaperTransaction = {
		id: string;
		invoiceId: string;
		timesheetId: string | null;
		batchNumber: string | null;
		transactionType: 'PAYMENT' | 'REFUND' | 'ADJUSTMENT';
		status: 'PENDING' | 'SUCCESSFUL' | 'FAILED' | 'CANCELLED';
		amount: string;
		details: { notes?: string } | null;
		createdAt: string | Date;
		updatedAt: string | Date;
	};

	$: paperTransactions = (data.paperTransactions ?? []) as PaperTransaction[];

	// Stripe per-payment history, read live from Stripe's Invoice Payments API
	// (admin + Stripe invoices only). Each entry is one settled payment — the
	// Stripe equivalent of a paper PAYMENT transaction.
	type StripePayment = {
		id: string;
		amount: number;
		status: string;
		paidAt: string | Date;
		reference: string | null;
	};
	$: stripePayments = (data.stripePayments ?? []) as StripePayment[];

	function txIcon(type: PaperTransaction['transactionType']) {
		switch (type) {
			case 'PAYMENT':
				return ArrowDownCircle;
			case 'REFUND':
				return Undo2;
			case 'ADJUSTMENT':
				return Sliders;
			default:
				return DollarSign;
		}
	}

	function txAccent(type: PaperTransaction['transactionType']) {
		// Returns Tailwind classes for icon color + amount color.
		switch (type) {
			case 'PAYMENT':
				return { icon: 'text-green-600', amount: 'text-green-700', sign: '+' };
			case 'REFUND':
				return { icon: 'text-red-600', amount: 'text-red-700', sign: '−' };
			case 'ADJUSTMENT':
				return { icon: 'text-blue-600', amount: 'text-blue-700', sign: '' };
			default:
				return { icon: 'text-gray-600', amount: 'text-gray-700', sign: '' };
		}
	}

	function txLabel(type: PaperTransaction['transactionType']) {
		switch (type) {
			case 'PAYMENT':
				return 'Payment';
			case 'REFUND':
				return 'Refund';
			case 'ADJUSTMENT':
				return 'Adjustment';
			default:
				return type;
		}
	}

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
				<StatusBadge
					status={invoiceData.invoice.status}
					label={invoiceData.invoice.status === 'void'
						? 'VOIDED'
						: invoiceData.invoice.status.toUpperCase()}
				/>
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

			{#if isAdmin && !isPaperInvoice && isOverdue && invoiceData.invoice.status !== 'void' && invoiceData.invoice.status !== 'uncollectible'}
				<form
					use:enhance={() => {
						processingPayment = true;
						return async ({ result, update }) => {
							processingPayment = false;
							if (result.type === 'success') {
								await invalidateAll();
							}
							await update();
						};
					}}
					action="?/adminProcessInvoice"
					method="POST"
				>
					<Button type="submit" size="sm" class="w-full sm:w-fit" disabled={processingPayment}>
						{#if processingPayment}
							<Loader2 class="h-4 w-4 mr-2 animate-spin" />
							Processing...
						{:else}
							<CreditCard class="h-4 w-4 mr-2" />
							Process Payment
						{/if}
					</Button>
				</form>
			{/if}

			{#if isAdmin && isPaperInvoice && !isFullyPaid && invoiceData.invoice.status !== 'void'}
				<Button
					size="sm"
					class="w-full sm:w-fit bg-primary hover:bg-primary/90"
					on:click={() => (recordTransactionOpen = true)}
				>
					<CreditCard class="h-4 w-4 mr-2" />
					Record Transaction
				</Button>
			{/if}

			{#if isAdmin && isPaperInvoice && amountPaid > 0 && !isVoided}
				<Button
					size="sm"
					variant="outline"
					class="w-full sm:w-fit"
					on:click={() => {
						reverseAmount = amountPaid.toFixed(2);
						reverseReason = '';
						reversePaymentOpen = true;
					}}
				>
					<Undo2 class="h-4 w-4 mr-2" />
					Reverse Payment
				</Button>
			{/if}

			{#if isAdmin && !isVoided && invoiceData.invoice.status !== 'paid' && invoiceData.invoice.status !== 'uncollectible'}
				<Button
					size="sm"
					variant="destructiveOutline"
					class="w-full sm:w-fit"
					on:click={() => {
						voidReason = '';
						voidInvoiceOpen = true;
					}}
				>
					<XCircle class="h-4 w-4 mr-2" />
					Void Invoice
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

			{#if isPaperInvoice}
				<Button
					href={`/invoices/${invoiceData.invoice.id}/pdf`}
					data-sveltekit-reload
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

	{#if isVoided}
		<div class="rounded-md border border-red-200 bg-red-50 p-4">
			<div class="flex items-start gap-3">
				<XCircle class="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
				<div class="space-y-1">
					<p class="text-sm font-semibold text-red-800">
						This invoice was voided{#if invoiceData.invoice.voidedAt}&nbsp;on {formatDate(
								invoiceData.invoice.voidedAt
							)}{/if}.
					</p>
					{#if invoiceData.invoice.voidReason}
						<p class="text-sm whitespace-pre-line text-red-700">
							<span class="font-medium">Reason:</span>
							{invoiceData.invoice.voidReason}
						</p>
					{/if}
				</div>
			</div>
		</div>
	{/if}

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
										{formatCurrency(
											Number(item.unit_amount_excluding_tax ?? item.unit_amount ?? 0) / 100
										)}
									</Table.Cell>
									<Table.Cell class="text-right font-medium">
										{formatCurrency(Number(item.amount) / 100)}
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>

					<Separator class="my-4" />

					<!-- Totals -->
					<div class="space-y-2">
						<div class="flex justify-between text-sm">
							<span>Subtotal (includes any platform fees)</span>
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
						{#if amountPaid > 0}
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
							{#if paperTransactions.length > 0}
								<ol class="relative space-y-4">
									<!-- Vertical guide line for the timeline -->
									<span
										class="absolute left-[18px] top-2 bottom-2 w-px bg-border"
										aria-hidden="true"
									></span>

									{#each paperTransactions as tx (tx.id)}
										{@const accent = txAccent(tx.transactionType)}
										{@const Icon = txIcon(tx.transactionType)}
										<li class="relative flex items-start gap-3 pl-0">
											<span
												class="relative z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white border shadow-sm shrink-0"
											>
												<svelte:component this={Icon} class="h-4 w-4 {accent.icon}" />
											</span>
											<div class="flex-1 min-w-0">
												<div class="flex items-center justify-between gap-2 flex-wrap">
													<p class="font-medium">
														{txLabel(tx.transactionType)}
														{#if tx.status !== 'SUCCESSFUL'}
															<span class="text-xs text-muted-foreground font-normal">
																· {tx.status.toLowerCase()}
															</span>
														{/if}
													</p>
													<p class="font-medium {accent.amount} whitespace-nowrap">
														{accent.sign}{formatCurrency(parseFloat(tx.amount))}
													</p>
												</div>
												<p class="text-xs text-muted-foreground mt-0.5">
													{formatDateTime(tx.createdAt)}
													{#if tx.batchNumber}
														· Batch {tx.batchNumber}
													{/if}
												</p>
												{#if tx.details?.notes}
													<p class="text-sm text-muted-foreground mt-1 whitespace-pre-line">
														{tx.details.notes}
													</p>
												{/if}
											</div>
										</li>
									{/each}
								</ol>

								<Separator class="my-4" />

								<div class="space-y-2">
									<div class="flex items-center justify-between text-sm">
										<span class="text-muted-foreground">Total Paid</span>
										<span class="font-medium text-green-700">
											{formatCurrency(parseFloat(String(invoiceData.invoice.amountPaid ?? 0)))}
										</span>
									</div>
									{#if amountRemaining > 0}
										<div class="flex items-center justify-between text-sm">
											<span class="text-orange-700 font-medium">Balance Remaining</span>
											<span class="font-medium text-orange-700">
												{formatCurrency(amountRemaining)}
											</span>
										</div>
									{:else}
										<div class="flex items-center justify-between text-sm">
											<span class="text-green-700 font-medium">Paid in Full</span>
											<CheckCircle class="h-4 w-4 text-green-600" />
										</div>
									{/if}
								</div>
							{:else}
								<div class="text-center py-8 text-muted-foreground">
									<CreditCard class="h-8 w-8 mx-auto mb-2 opacity-50" />
									<p>No transactions recorded yet</p>
									{#if !isFullyPaid && invoiceData.invoice.status !== 'void'}
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
						{:else if stripePayments.length > 0}
							<ol class="relative space-y-4">
								<!-- Vertical guide line for the timeline -->
								<span
									class="absolute left-[18px] top-2 bottom-2 w-px bg-border"
									aria-hidden="true"
								></span>

								{#each stripePayments as p (p.id)}
									{@const accent = txAccent('PAYMENT')}
									{@const Icon = txIcon('PAYMENT')}
									<li class="relative flex items-start gap-3 pl-0">
										<span
											class="relative z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white border shadow-sm shrink-0"
										>
											<svelte:component this={Icon} class="h-4 w-4 {accent.icon}" />
										</span>
										<div class="flex-1 min-w-0">
											<div class="flex items-center justify-between gap-2 flex-wrap">
												<p class="font-medium">{txLabel('PAYMENT')}</p>
												<p class="font-medium {accent.amount} whitespace-nowrap">
													{accent.sign}{formatCurrency(p.amount)}
												</p>
											</div>
											<p class="text-xs text-muted-foreground mt-0.5">
												{formatDateTime(p.paidAt)}
												{#if p.reference}
													· <span class="font-mono">{p.reference}</span>
												{/if}
											</p>
										</div>
									</li>
								{/each}
							</ol>

							<Separator class="my-4" />

							<div class="space-y-2">
								<div class="flex items-center justify-between text-sm">
									<span class="text-muted-foreground">Total Paid</span>
									<span class="font-medium text-green-700">{formatCurrency(amountPaid)}</span>
								</div>
								{#if amountRemaining > 0}
									<div class="flex items-center justify-between text-sm">
										<span class="text-orange-700 font-medium">Balance Remaining</span>
										<span class="font-medium text-orange-700">
											{formatCurrency(amountRemaining)}
										</span>
									</div>
								{:else}
									<div class="flex items-center justify-between text-sm">
										<span class="text-green-700 font-medium">Paid in Full</span>
										<CheckCircle class="h-4 w-4 text-green-600" />
									</div>
								{/if}
							</div>
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
							transactionType = '';
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
							selected={transactionType
								? { value: transactionType, label: transactionTypeLabels[transactionType] }
								: undefined}
							onSelectedChange={(v) => {
								if (v) setTransactionType(v.value);
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
						variant="destructiveOutline"
						on:click={() => (recordTransactionOpen = false)}
						disabled={recordingTransaction}
					>
						Cancel
					</Button>
					<Button
						type="submit"
						disabled={recordingTransaction || !transactionAmount || !transactionType}
					>
						{#if recordingTransaction}
							<Loader2 class="mr-2 h-4 w-4 animate-spin" />
						{/if}
						Record Transaction
					</Button>
				</Dialog.DialogFooter>
			</form>
		</Dialog.DialogContent>
	</Dialog.Root>

	<!-- Reverse Payment -->
	<Dialog.Root bind:open={reversePaymentOpen}>
		<Dialog.DialogContent class="sm:max-w-[425px]">
			<form
				method="POST"
				action="?/reversePaperPayment"
				use:enhance={() => {
					reversingPayment = true;
					return async ({ result, update }) => {
						reversingPayment = false;
						if (result.type === 'success') {
							reversePaymentOpen = false;
							reverseAmount = '';
							reverseReason = '';
							await invalidateAll();
						}
						await update();
					};
				}}
			>
				<Dialog.DialogHeader>
					<Dialog.DialogTitle>Reverse Payment</Dialog.DialogTitle>
					<Dialog.DialogDescription>
						Undo a payment recorded in error on invoice #{invoiceData.invoice.invoiceNumber}. The
						invoice returns to <strong>open</strong> with the balance owed again. Amount paid: {formatCurrency(
							amountPaid
						)}
					</Dialog.DialogDescription>
				</Dialog.DialogHeader>

				<input type="hidden" name="invoiceId" value={invoiceData.invoice.id} />

				<div class="space-y-4 py-4">
					<div class="space-y-2">
						<Label for="reverseAmount">Amount to Reverse</Label>
						<div class="relative">
							<span class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
							<Input
								id="reverseAmount"
								name="amount"
								type="number"
								step="0.01"
								min="0.01"
								max={amountPaid}
								bind:value={reverseAmount}
								class="pl-7"
								placeholder="0.00"
								required
							/>
						</div>
						{#if parseFloat(reverseAmount) > amountPaid}
							<p class="text-xs text-orange-600">
								Amount exceeds the amount paid of {formatCurrency(amountPaid)}
							</p>
						{/if}
					</div>

					<div class="space-y-2">
						<Label for="reverseReason">Reason <span class="text-red-600">*</span></Label>
						<Textarea
							id="reverseReason"
							name="reason"
							bind:value={reverseReason}
							placeholder="Why is this payment being reversed?"
							rows={2}
							required
						/>
					</div>
				</div>

				<Dialog.DialogFooter>
					<Button
						type="button"
						variant="destructiveOutline"
						on:click={() => (reversePaymentOpen = false)}
						disabled={reversingPayment}
					>
						Cancel
					</Button>
					<Button
						type="submit"
						disabled={reversingPayment ||
							!reverseReason.trim() ||
							!reverseAmount ||
							parseFloat(reverseAmount) > amountPaid}
					>
						{#if reversingPayment}
							<Loader2 class="mr-2 h-4 w-4 animate-spin" />
						{/if}
						Reverse Payment
					</Button>
				</Dialog.DialogFooter>
			</form>
		</Dialog.DialogContent>
	</Dialog.Root>

	<!-- Void Invoice -->
	<Dialog.Root bind:open={voidInvoiceOpen}>
		<Dialog.DialogContent class="sm:max-w-[425px]">
			<form
				method="POST"
				action="?/voidInvoice"
				use:enhance={() => {
					voidingInvoice = true;
					return async ({ result, update }) => {
						voidingInvoice = false;
						if (result.type === 'success') {
							voidInvoiceOpen = false;
							voidReason = '';
							await invalidateAll();
						}
						await update();
					};
				}}
			>
				<Dialog.DialogHeader>
					<Dialog.DialogTitle>Void Invoice</Dialog.DialogTitle>
					<Dialog.DialogDescription>
						Voiding invoice #{invoiceData.invoice.invoiceNumber} marks it as no longer due and stops
						further collection. This cannot be undone.
					</Dialog.DialogDescription>
				</Dialog.DialogHeader>

				{#if invoiceData.invoice.timesheetId}
					<p class="mt-2 rounded-md bg-amber-50 p-3 text-sm text-amber-700">
						This invoice is tied to a timesheet. Voiding it also voids that timesheet and reopens the
						work as a fresh draft so it can be corrected and re-invoiced.
					</p>
				{/if}

				<input type="hidden" name="invoiceId" value={invoiceData.invoice.id} />

				<div class="space-y-4 py-4">
					<div class="space-y-2">
						<Label for="voidReason">Reason <span class="text-muted-foreground">(optional)</span></Label>
						<Textarea
							id="voidReason"
							name="reason"
							bind:value={voidReason}
							placeholder="Why is this invoice being voided? (shown on the invoice)"
							rows={2}
						/>
					</div>
				</div>

				<Dialog.DialogFooter>
					<Button
						type="button"
						variant="outline"
						on:click={() => (voidInvoiceOpen = false)}
						disabled={voidingInvoice}
					>
						Cancel
					</Button>
					<Button type="submit" variant="destructive" disabled={voidingInvoice}>
						{#if voidingInvoice}
							<Loader2 class="mr-2 h-4 w-4 animate-spin" />
						{/if}
						Void Invoice
					</Button>
				</Dialog.DialogFooter>
			</form>
		</Dialog.DialogContent>
	</Dialog.Root>
{/if}
