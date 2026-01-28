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

	export let data: PageData;

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
			{#if !isAdmin && invoiceData.invoice.status === 'open'}
				<Button size="sm" href={invoiceData.invoice.stripeHostedUrl} class="w-full sm:w-fit">
					<CreditCard class="h-4 w-4 mr-2" />
					Pay Invoice
				</Button>
			{/if}
			{#if isAdmin && isOverdue}
				<form use:enhance action="?/adminProcessInvoice" method="POST">
					<Button type="submit" size="sm" class="w-full sm:w-fit">
						<CreditCard class="h-4 w-4 mr-2" />
						Process Invoice
					</Button>
				</form>
			{/if}
			<Button
				href={invoiceData.invoice.stripePdfUrl}
				variant="outline"
				size="sm"
				class="w-full sm:w-fit"
			>
				<Download class="h-4 w-4 mr-2" />
				Download PDF
			</Button>
			<!-- {#if isAdmin}
				<Button variant="outline" size="sm">
					<Mail class="h-4 w-4 mr-2" />
					Send Invoice
				</Button>
				<DropdownMenu.Root>
					<DropdownMenu.Trigger asChild let:builder>
						<Button variant="outline" size="sm" builders={[builder]}>
							<MoreHorizontal class="h-4 w-4" />
						</Button>
					</DropdownMenu.Trigger>
					<DropdownMenu.Content>
						<DropdownMenu.Item>Edit Invoice</DropdownMenu.Item>
						<DropdownMenu.Item>Duplicate</DropdownMenu.Item>
						<DropdownMenu.Separator />
						<DropdownMenu.Item>Mark as Paid</DropdownMenu.Item>
						<DropdownMenu.Item>Mark as Overdue</DropdownMenu.Item>
						<DropdownMenu.Separator />
						<DropdownMenu.Item class="text-destructive">Cancel Invoice</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			{/if} -->
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
					</div>
				</Card.Content>
			</Card.Root>

			{#if isAdmin}
				<!-- Admin: Payment History -->
				<Card.Root>
					<Card.Header>
						<Card.Title class="flex items-center gap-2">
							<CreditCard class="h-5 w-5" />
							Payment History
						</Card.Title>
					</Card.Header>
					<Card.Content>
						{#if invoiceData.invoice.paidAt}
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
