<script lang="ts">
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import { AlertCircle, FileClock, PlusIcon, ScrollText, UserPlus } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { formatCurrency, formatDate, formatTicketDate } from '$lib/_helpers';
	import NewSupportTicketDialog from '$lib/components/dialogs/newSupportTicketDialog.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { StatusBadge } from '$lib/components/ui/status-badge';
	import { cn } from '$lib/utils';

	export let user;
	export let data;

	let supportDialogOpen: boolean = false;
	let requisitionDrawerClosed: boolean = true;

	$: console.log({ data });
	$: requisitions = data.requisitions;
	$: supportTickets = data.supportTickets;
	$: newApplicationsCount = data.newApplicationsCount;
	$: supportTicketForm = data.supportTicketForm;
	$: timesheetsDueCount = data.timesheetsDueCount;
	$: timesheetsDue = data.timesheetsDue;
	$: timesheetDiscrepancies = data.discrepanciesCount;
	$: recentApplications = data.recentApplications;
</script>

<section class="grow grid grid-cols-1 lg:grid-cols-3">
	<div class="p-6 col-span-1 lg:col-span-2 flex flex-col gap-6">
		<h1 class="text-3xl font-extrabold leading-tight tracking-tighter md:text-4xl">
			Welcome, {user?.firstName}
			{user?.lastName}
		</h1>
	</div>
	<div class="col-span-3 p-6 grid grid-cols-12 gap-4">
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
						<div class="bg-primary p-2 rounded-full">
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
		<div class="col-span-12 md:col-span-8">
			<Card.Root>
				<Card.Header class="flex flex-row justify-between items-center flex-wrap">
					<Card.Title class="text-xl md:text-2xl">Requisitions</Card.Title>
					<Button class="bg-primary hover:bg-primary/90"
						><PlusIcon size={20} class="mr-2" /> New Requisition</Button
					>
				</Card.Header>
				<Card.Content class="p-2 md:p-4">
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head>Title</Table.Head>
								<Table.Head>Created Date</Table.Head>
								<Table.Head>Status</Table.Head>
								<Table.Head class="text-right">Hourly Rate</Table.Head>
								<Table.Head>Position Type</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each requisitions as req, i (req.id)}
								<Table.Row class="cursor-pointer" on:click={() => goto(`/requisitions/${req.id}`)}>
									<Table.Cell>{req.title}</Table.Cell>
									<Table.Cell>{formatDate(req.createdAt)}</Table.Cell>
									<Table.Cell>
										<StatusBadge status={req.status} />
									</Table.Cell>
									<Table.Cell class="text-right">{formatCurrency(req.hourlyRate)}</Table.Cell>
									<Table.Cell>
										{req.permanentPosition ? 'Permanent' : 'Temporary'}
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				</Card.Content>
				<Card.Footer class="">
					<Button class="bg-primary hover:bg-primary/90" href="/requisitions">See All</Button>
				</Card.Footer>
			</Card.Root>
		</div>
		<div class="col-span-12 md:col-span-4">
			<Card.Root>
				<Card.Header class="flex flex-row justify-between items-center flex-wrap">
					<Card.Title class="text-xl md:text-2xl">Support Tickets</Card.Title>
					<NewSupportTicketDialog bind:open={supportDialogOpen} {user} form={supportTicketForm} />
				</Card.Header>
				<Card.Content class="p-2 md:p-4">
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head class="">Title</Table.Head>
								<Table.Head>Status</Table.Head>
								<Table.Head>Created</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each supportTickets as { supportTicket }, i (supportTicket.id)}
								<Table.Row
									class="cursor-pointer"
									on:click={() => goto(`/support/ticket/${supportTicket.id}`)}
								>
									<Table.Cell>
										<div class="flex flex-col">
											<span class="font-medium">{supportTicket.title}</span>
										</div>
									</Table.Cell>

									<Table.Cell>
										<StatusBadge status={supportTicket.status} />
									</Table.Cell>
									<Table.Cell>
										<span class="text-gray-500">
											{formatTicketDate(supportTicket.createdAt)}
										</span>
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				</Card.Content>
				<Card.Footer>
					<Button class="bg-primary hover:bg-primary/90" href={'/support'}>See All</Button>
				</Card.Footer>
			</Card.Root>
		</div>
		<div class="col-span-12 md:col-span-6">
			<Card.Root>
				<Card.Header class="flex flex-row justify-between items-center flex-wrap">
					<Card.Title class="text-xl md:text-2xl">Timesheets Due</Card.Title>
					<Button class="bg-primary hover:bg-primary/90" href={'/timesheets'}>See All</Button>
				</Card.Header>
				<Card.Content class="p-2 md:p-4">
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head class="">Requisition</Table.Head>
								<Table.Head class="">Submitted By</Table.Head>
								<Table.Head>Status</Table.Head>
								<Table.Head>Work Week</Table.Head>
								<Table.Head>Hours</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each timesheetsDue as timesheet, i (timesheet.id)}
								<Table.Row
									class="cursor-pointer"
									on:click={() => goto(`/timesheets/${timesheet.id}`)}
								>
									<Table.Cell>
										<div class="flex flex-col">
											<span class="font-medium">{timesheet.requisition.title}</span>
										</div>
									</Table.Cell>

									<Table.Cell>
										<p>{user.firstName} {user.lastName}</p>
									</Table.Cell>
									<Table.Cell>
										<StatusBadge status={timesheet.status} />
									</Table.Cell>
									<Table.Cell>
										<span class="text-gray-500">
											{formatTicketDate(timesheet.createdAt)}
										</span>
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				</Card.Content>
			</Card.Root>
		</div>
		<div class="col-span-12 md:col-span-6">
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
											<span class="font-medium">{requisition.title}</span>
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
											{formatTicketDate(application.createdAt)}
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
