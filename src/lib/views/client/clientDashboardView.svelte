<script lang="ts">
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import {
		AlertCircle,
		DollarSign,
		FileClock,
		FileText,
		PlusIcon,
		ScrollText,
		UserPlus
	} from 'lucide-svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { formatCurrency, formatDate, formatTicketDate } from '$lib/_helpers';
	import { openStripeSetupInNewTab } from '$lib/_helpers/openStripeSetup';
	import SupportTicketDialog from '$lib/components/dialogs/supportTicketDialog.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { StatusBadge } from '$lib/components/ui/status-badge';
	import { cn } from '$lib/utils';
	import { format, parse } from 'date-fns';
	import { USER_ROLES } from '$lib/config/constants';
	import AddRequisitionDrawer from '$lib/components/drawers/addRequisitionDrawer.svelte';
	import type { ClientRequisitionSchema } from '$lib/config/zod-schemas';
	import type { SuperValidated } from 'sveltekit-superforms';
	import { formatInTimeZone } from 'date-fns-tz';

	export let user;
	export let data;
	export let clientForm;
	let drawerExpanded = false;
	let billingSetupSubmitting = false;
	let billingSetupError = '';
	let billingHelpOpen = false;

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

	$: clientForm = data.clientForm as SuperValidated<ClientRequisitionSchema> | null;
	$: console.log({ data });
	$: requisitions = data.requisitions;
	$: newApplicationsCount = data.newApplicationsCount;
	$: timesheetsDueCount = data.timesheetsDueCount;
	$: timesheetsDue = data.timesheetsDue;
	$: timesheetDiscrepancies = data.discrepanciesCount;
	$: recentApplications = data.recentApplications;

	// Invoice-related data
	$: invoices = data.invoices || [];
	$: overdueInvoicesCount = data.overdueInvoicesCount || 0;
	$: pendingInvoicesCount = data.pendingInvoicesCount || 0;
	$: totalAmountDue = parseInt(data.totalAmountDue || '0');

	// Function to format work week
	function formatWorkWeek(
		recurrenceDays: { dayStart: Date; dayEnd: Date }[],
		timezone: string
	): string {
		if (!recurrenceDays || recurrenceDays.length === 0) return 'No shifts scheduled';

		function format(date: Date) {
			return formatInTimeZone(new Date(date), timezone, 'MMMM d');
		}

		if (recurrenceDays.length === 1) {
			return format(recurrenceDays[0].dayStart);
		}

		const sorted = [...recurrenceDays].sort(
			(a, b) => new Date(a.dayStart).getTime() - new Date(b.dayStart).getTime()
		);

		const first = format(sorted[0].dayStart);
		const last = format(sorted[sorted.length - 1].dayStart);

		return `${first} – ${last}`;
	}
</script>

<section class="grow grid grid-cols-1 lg:grid-cols-3">
	<div class="p-6 col-span-1 lg:col-span-2 flex flex-col gap-6">
		<h1 class="text-3xl font-extrabold leading-tight tracking-tighter md:text-4xl">
			Welcome, {user?.firstName}
			{user?.lastName}
		</h1>
		{#if data.clientStatus && !data.canCreateRequisitions}
			<div
				class="rounded-md border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-900"
			>
				{#if data.clientStatus === 'PENDING'}
					Your account is <strong>pending approval</strong>. You'll be able to post requisitions
					once an admin approves you.
				{:else if data.clientStatus === 'DENIED'}
					Your account has been <strong>denied</strong>. Please contact support if you believe this
					is a mistake.
				{:else}
					Your account is <strong>inactive</strong>. Requisition posting is paused. Contact support
					to reactivate.
				{/if}
			</div>
		{/if}

		{#if user?.role === USER_ROLES.CLIENT && data.hasBillingSetup === false}
			<div
				class="rounded-md border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
			>
				<div>
					<strong>Finish setting up billing.</strong> Save a payment method so we can charge for
					services once you start hiring. You won't be charged anything today.
				</div>
				<div class="flex flex-wrap gap-2">
					<Button
						type="button"
						size="sm"
						class="bg-primary hover:bg-primary/90"
						disabled={billingSetupSubmitting}
						on:click={startBillingSetup}
					>
						{billingSetupSubmitting ? 'Opening Stripe…' : 'Set up billing'}
					</Button>
					<Button
						type="button"
						size="sm"
						variant="outline"
						on:click={() => (billingHelpOpen = true)}
					>
						Need help?
					</Button>
				</div>
			</div>
			{#if billingSetupError}
				<div
					class="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
				>
					{billingSetupError}
				</div>
			{/if}
		{/if}
	</div>
	<div class="col-span-3 p-6 grid grid-cols-12 gap-4">
		<!-- Original metric cards -->
		<div class="col-span-12 md:col-span-6 lg:col-span-4">
			<Card.Root>
				<Card.Content class="p-2 md:p-4">
					<div class="flex gap-4 items-center">
						<div class="bg-primary p-2 rounded-full">
							<FileClock size={24} color={'white'} />
						</div>
						<div class="space-y-2">
							<p class="text-slate-500">Timesheets Due</p>
							<p class="font-bold text-2xl md:text-4xl">{timesheetsDueCount}</p>
						</div>
					</div>
				</Card.Content>
			</Card.Root>
		</div>
		<div class="col-span-12 md:col-span-6 lg:col-span-4">
			<Card.Root>
				<Card.Content class="p-2 md:p-4">
					<div class="flex gap-4 items-center">
						<div class="bg-yellow-400 p-2 rounded-full">
							<AlertCircle size={24} color={'white'} />
						</div>
						<div class="space-y-2">
							<p class="text-slate-500">Timesheet Discrepancies</p>
							<p class="font-bold text-2xl md:text-4xl">{timesheetDiscrepancies}</p>
						</div>
					</div>
				</Card.Content>
			</Card.Root>
		</div>
		<div class="col-span-12 md:col-span-6 lg:col-span-4">
			<Card.Root>
				<Card.Content class="p-2 md:p-4">
					<div class="flex gap-4 items-center">
						<div class="bg-primary p-2 rounded-full">
							<UserPlus size={24} color={'white'} />
						</div>
						<div class="space-y-2">
							<p class="text-slate-500">New Applications</p>
							<p class="font-bold text-2xl md:text-4xl">{newApplicationsCount}</p>
						</div>
					</div>
				</Card.Content>
			</Card.Root>
		</div>

		<!-- New invoice metrics -->
		<div class="col-span-12 md:col-span-6 lg:col-span-4">
			<Card.Root>
				<Card.Content class="p-2 md:p-4">
					<div class="flex gap-4 items-center">
						<div class="bg-success p-2 rounded-full">
							<DollarSign size={24} color={'white'} />
						</div>
						<div class="space-y-2">
							<p class="text-slate-500">Total Amount Due</p>
							<p class="font-bold text-2xl md:text-3xl">{formatCurrency(totalAmountDue)}</p>
						</div>
					</div>
				</Card.Content>
			</Card.Root>
		</div>
		<div class="col-span-12 md:col-span-6 lg:col-span-4">
			<Card.Root>
				<Card.Content class="p-2 md:p-4">
					<div class="flex gap-4 items-center">
						<div class="bg-yellow-600 p-2 rounded-full">
							<FileText size={24} color={'white'} />
						</div>
						<div class="space-y-2">
							<p class="text-slate-500">Pending Invoices</p>
							<p class="font-bold text-2xl md:text-4xl">{pendingInvoicesCount}</p>
						</div>
					</div>
				</Card.Content>
			</Card.Root>
		</div>
		<div class="col-span-12 md:col-span-6 lg:col-span-4">
			<Card.Root>
				<Card.Content class="p-2 md:p-4">
					<div class="flex gap-4 items-center">
						<div class="bg-destructive p-2 rounded-full">
							<AlertCircle size={24} color={'white'} />
						</div>
						<div class="space-y-2">
							<p class="text-slate-500">Overdue Invoices</p>
							<p class="font-bold text-2xl md:text-4xl">{overdueInvoicesCount}</p>
						</div>
					</div>
				</Card.Content>
			</Card.Root>
		</div>

		<!-- Requisitions table (moved to adjust layout) -->
		<div class="col-span-12">
			<Card.Root>
				<Card.Header class="flex flex-row justify-between items-center flex-wrap">
					<Card.Title class="text-xl md:text-2xl">Recent Requisitions</Card.Title>
					{#if data.canCreateRequisitions}
						<Button
							on:click={() => (drawerExpanded = true)}
							size="sm"
							class="bg-primary hover:bg-primary/90"
						>
							<PlusIcon size={16} class="mr-1" /> New Requisition
						</Button>
					{:else}
						<span class="text-xs text-muted-foreground"
							>Account {String(data.clientStatus ?? 'PENDING').toLowerCase()} — posting disabled</span
						>
					{/if}
				</Card.Header>
				<Card.Content class="p-2 md:p-4">
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<!-- 1st Column 🢃 -->
								<Table.Head>Requisition Number</Table.Head>
								<!-- 2nd Column 🢃 -->
								<Table.Head>Position</Table.Head>
								<!-- 3rd Column 🢃 -->
								<Table.Head>Status</Table.Head>
								<!-- 4th Column 🢃 -->
								<Table.Head>Type</Table.Head>
								<!-- 5th Column 🢃 -->
								<Table.Head>Rate</Table.Head>
								<!-- 6th Column 🢃 -->
								<Table.Head>Client</Table.Head>
								<!-- 7th Column 🢃 -->
								<Table.Head>Location</Table.Head>
								<!-- 8th Column 🢃 -->
								<Table.Head>Address</Table.Head>
								<!-- 9th Column 🢃 -->
								<Table.Head>Work Week</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each requisitions.slice(0, 5) as req, i (req.requisition.id)}
								<Table.Row
									class="cursor-pointer"
									on:click={() => goto(`/requisitions/${req.requisition.id}`)}
								>
									<Table.Cell>
										<!-- Requisition Number 1st -->
										<div class="flex flex-col">
											<span class="font-medium truncate max-w-[250px]">
												#{req.requisition.id}
											</span>
											<!-- <span class="text-xs text-gray-500">{req.company.companyName}</span> -->
										</div>
									</Table.Cell>
									<Table.Cell>
										<!-- Position 2nd -->
										<div class="flex flex-col">
											<span class="font-medium truncate max-w-[250px]"
												>{req.requisition.disciplineName}</span
											>
											<span class="text-xs text-gray-500">{req.company.companyName}</span>
										</div>
									</Table.Cell>
									<Table.Cell>
										<!-- Status 3rd -->
										<StatusBadge status={req.requisition.status} />
									</Table.Cell>
									<Table.Cell>
										<!-- Type 4th -->
										<Badge
											variant="secondary"
											value={req.requisition.permanentPosition ? 'Permanent' : 'Temporary'}
											class={cn(
												req.requisition.permanentPosition && 'bg-gray-300',
												!req.requisition.permanentPosition && 'bg-gray-300'
											)}
										/>
									</Table.Cell>
									<Table.Cell>
										<!-- Rate 5th -->
										{formatCurrency(req.requisition.hourlyRate)}+
									</Table.Cell>
									<Table.Cell>
										<!-- Client 6th -->
										{req.user.firstName}
										{req.user.lastName}
									</Table.Cell>
									<Table.Cell>
										<!-- Location 7th -->
										{req.location.locationName}
									</Table.Cell>
									<Table.Cell>
										<!-- Address 8th -->
										{req.location.completeAddress}
									</Table.Cell>
									<Table.Cell>
										<!-- Work Week 9th -->
										{formatWorkWeek(req.recurrenceDays, req.referenceTimezone)}
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				</Card.Content>
				<Card.Footer>
					<Button size="sm" class="bg-primary hover:bg-primary/90" href="/requisitions"
						>See All</Button
					>
				</Card.Footer>
			</Card.Root>
		</div>

		<!-- Invoices table -->
		<div class="col-span-12 xl:col-span-12">
			<Card.Root>
				<Card.Header class="flex flex-row justify-between items-center flex-wrap">
					<Card.Title class="text-xl md:text-2xl">Recent Invoices</Card.Title>
				</Card.Header>
				<Card.Content class="p-2 md:p-4">
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head>Invoice #</Table.Head>
								<Table.Head>
									{#if user.role === USER_ROLES.SUPERADMIN}
										Client
									{:else}
										Candidate
									{/if}
								</Table.Head>
								<Table.Head>Due Date</Table.Head>
								<Table.Head>Status</Table.Head>
								<Table.Head class="text-right">Amount</Table.Head>
								<Table.Head>Type</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each invoices as invoiceData, i (invoiceData.invoice.id)}
								<Table.Row
									class="cursor-pointer"
									on:click={() => goto(`/invoices/${invoiceData.invoice.id}`)}
								>
									<Table.Cell class="font-medium">{invoiceData.invoice.invoiceNumber}</Table.Cell>
									{#if user.role === USER_ROLES.CLIENT || user.role === USER_ROLES.CLIENT_STAFF}
										<Table.Cell>
											{invoiceData.candidate?.user?.firstName || 'None'}
											{invoiceData.candidate?.user?.lastName || 'Specified'}
										</Table.Cell>
									{:else}
										<Table.Cell>
											{invoiceData.invoice.vendor?.firstName}
											{invoiceData.invoice.vendor?.lastName}
										</Table.Cell>
									{/if}
									<Table.Cell>
										{#if invoiceData.invoice.dueDate}
											<span
												class={cn(
													'text-sm',
													invoiceData.invoice.dueDate < new Date() &&
														invoiceData.invoice.status !== 'paid' &&
														'text-red-600 font-semibold'
												)}
											>
												{format(invoiceData.invoice.dueDate, 'PP')}
											</span>
										{:else}
											<span class="text-gray-400">-</span>
										{/if}
									</Table.Cell>
									<Table.Cell>
										<StatusBadge
											status={invoiceData.invoice.status}
											label={invoiceData.invoice.status.toUpperCase()}
										/>
									</Table.Cell>
									<Table.Cell class="text-right font-semibold">
										{formatCurrency(invoiceData.invoice.total)}
									</Table.Cell>
									<Table.Cell>
										<Badge variant="outline" value={invoiceData.invoice.sourceType.toUpperCase()} />
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				</Card.Content>
				<Card.Footer>
					<Button class="bg-primary hover:bg-primary/90" href="/invoices">See All</Button>
				</Card.Footer>
			</Card.Root>
		</div>

		<!-- Timesheets Due -->
		<div class="col-span-12 lg:col-span-6">
			<Card.Root>
				<Card.Header class="flex flex-row justify-between items-center flex-wrap">
					<Card.Title class="text-xl md:text-2xl">Timesheets Due</Card.Title>
					<Button size="sm" class="bg-primary hover:bg-primary/90" href={'/timesheets'}
						>See All</Button
					>
				</Card.Header>
				<Card.Content class="p-2 md:p-4">
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head class="">Requisition</Table.Head>
								<Table.Head>Status</Table.Head>
								<Table.Head>Week Of</Table.Head>
								<Table.Head>Hours</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each timesheetsDue.slice(0, 5) as timesheet, i (timesheet.timesheet.id)}
								<Table.Row
									class="cursor-pointer"
									on:click={() => goto(`/timesheets/${timesheet.timesheet.id}`)}
								>
									<Table.Cell>
										<div class="flex flex-col">
											<span class="font-medium truncate max-w-[150px]"
												>{timesheet.requisition.disciplineName}
												<span class="text-xs text-muted-foreground"
													>#{timesheet.requisition.id}</span
												></span
											>
											<span class="text-xs text-gray-500">
												{timesheet.candidate?.firstName}
												{timesheet.candidate?.lastName}
											</span>
										</div>
									</Table.Cell>
									<Table.Cell>
										<StatusBadge status={timesheet.timesheet.status} />
									</Table.Cell>
									<Table.Cell>
										<span class="text-gray-500">
											{format(timesheet.timesheet.weekBeginDate, 'PP')}
										</span>
									</Table.Cell>
									<Table.Cell>
										<span class="text-gray-500">
											{parseFloat(timesheet.timesheet.totalHoursWorked || '0').toFixed(2)}
										</span>
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				</Card.Content>
			</Card.Root>
		</div>

		<!-- Recent Applications -->
		<div class="col-span-12 lg:col-span-6">
			<Card.Root>
				<Card.Header class="flex flex-row justify-between items-center flex-wrap">
					<Card.Title class="text-xl md:text-2xl">Recent Applications</Card.Title>
				</Card.Header>
				<Card.Content class="p-2 md:p-4">
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head class="">Position</Table.Head>
								<Table.Head class="">Applicant</Table.Head>
								<Table.Head>Status</Table.Head>
								<Table.Head>Applied Date</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each recentApplications as { application, user, requisition }, i (application.id)}
								<Table.Row
									class="cursor-pointer"
									on:click={() =>
										goto(`/requisitions/${requisition.id}/application/${application.id}`)}
								>
									<Table.Cell>
										<div class="flex flex-col">
											<span class="font-medium"
												>{requisition.disciplineName ?? requisition.title ?? '—'}</span
											>
										</div>
									</Table.Cell>

									<Table.Cell>
										<p>{user.firstName} {user.lastName}</p>
									</Table.Cell>
									<Table.Cell>
										<StatusBadge status={application.status} />
									</Table.Cell>
									<Table.Cell>
										<span class="text-gray-500">
											{format(application.createdAt, 'PP')}
										</span>
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				</Card.Content>
			</Card.Root>
		</div>
	</div>
</section>

<!-- Add Requisition Drawer -->
<AddRequisitionDrawer {user} bind:drawerExpanded {clientForm} />

<!-- Billing help modal (triggered from the "Need help?" button in the billing banner) -->
<SupportTicketDialog
	bind:open={billingHelpOpen}
	title="Get help setting up billing"
	description="Tell us anything that would help — preferred contact times, payment method preference, etc. An admin will reach out."
	defaultTitle="Billing setup help needed"
	defaultBody="I'd like an admin to help me set up billing for my account."
	submitLabel="Request admin help"
/>
