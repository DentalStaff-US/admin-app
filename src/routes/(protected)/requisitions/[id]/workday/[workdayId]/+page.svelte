<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import { Separator } from '$lib/components/ui/separator';
	import { Badge } from '$lib/components/ui/badge';
	import {
		Dialog,
		DialogContent,
		DialogDescription,
		DialogFooter,
		DialogHeader,
		DialogTitle,
		DialogTrigger
	} from '$lib/components/ui/dialog';
	import {
		AlertDialog,
		AlertDialogAction,
		AlertDialogCancel,
		AlertDialogContent,
		AlertDialogDescription,
		AlertDialogFooter,
		AlertDialogHeader,
		AlertDialogTitle
		// AlertDialogTrigger
	} from '$lib/components/ui/alert-dialog';
	import { Avatar, AvatarFallback, AvatarImage } from '$lib/components/ui/avatar';
	import { Calendar } from '$lib/components/ui/calendar';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuItem,
		DropdownMenuLabel,
		DropdownMenuSeparator,
		DropdownMenuTrigger
	} from '$lib/components/ui/dropdown-menu';
	import type { PageData } from './$types';
	import { format } from 'date-fns';
	import { Plus, User } from 'lucide-svelte';
	import { BRAND_BASE } from '$lib/config/constants';

	export let data: PageData;
	$: recurrenceDay = data.recurrenceDay;
	$: workday = data.workday;
	$: candidate = workday?.candidate;
	$: timesheet = workday?.timesheet;
	$: hasWorkday = !!workday?.workday;

	let inviteDialogOpen = false;
	let blacklistDialogOpen = false;

	function handleInvite() {
		// Logic to invite candidate for more recurrence days
		console.log('Inviting candidate for more recurrence days');
		inviteDialogOpen = false;
	}

	function handleBlacklist() {
		// Logic to blacklist candidate
		console.log('Blacklisting candidate');
		blacklistDialogOpen = false;
	}

	function handleClaimDay() {
		// Logic to claim this recurrence day
		console.log('Claiming recurrence day');
	}

	const getStatusColor = (status) => {
		if (!status) return 'bg-gray-500';

		const statusColors = {
			OPEN: 'bg-blue-500',
			FILLED: 'bg-green-500',
			UNFULFILLED: 'bg-yellow-500',
			CANCELED: 'bg-red-500',
			PENDING: 'bg-purple-500'
		};

		return statusColors[status] || 'bg-gray-500';
	};
</script>

<section class="grow h-screen overflow-y-auto p-6 flex flex-col gap-6 container mx-auto">
	<div class="flex justify-between items-center flex-wrap gap-2">
		<h1 class="text-3xl font-extrabold leading-tight tracking-tighter md:text-4xl">
			Workday Details
		</h1>

		<div class="flex gap-2">
			{#if hasWorkday}
				<!-- Show actions dropdown if workday exists -->
				<DropdownMenu>
					<DropdownMenuTrigger>
						<Button variant="outline">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-4 w-4 mr-2"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
								/>
							</svg>
							Actions
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent>
						<DropdownMenuLabel>Workday Actions</DropdownMenuLabel>
						<DropdownMenuSeparator />
						<DropdownMenuItem>Edit Workday</DropdownMenuItem>
						{#if workday?.timesheet}
							<DropdownMenuItem
								on:click={() => (window.location.href = '/timesheets/' + workday.timesheet?.id)}
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-4 w-4 mr-2"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
									/>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
									/>
								</svg>
								View Timesheet
							</DropdownMenuItem>
							<!-- <DropdownMenuSeparator /> -->
						{/if}

						<!-- <DropdownMenuItem on:click={(e) => (blacklistDialogOpen = true)} class="text-red-500">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-4 w-4 mr-2"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
								/>
							</svg>
							Blacklist Candidate
						</DropdownMenuItem> -->
					</DropdownMenuContent>
				</DropdownMenu>
			{/if}
		</div>
	</div>

	<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
		<!-- Candidate Information (only if workday exists) -->
		{#if hasWorkday && candidate}
			<Card>
				<CardHeader>
					<CardTitle>Candidate Details</CardTitle>
				</CardHeader>
				<CardContent>
					<div class="flex items-center gap-4 mb-4">
						<Avatar class="h-16 w-16">
							<AvatarImage
								src={candidate.avatarUrl}
								alt={`${candidate.firstName} ${candidate.lastName}`}
							/>
							<AvatarFallback>{candidate.firstName?.[0]}{candidate.lastName?.[0]}</AvatarFallback>
						</Avatar>
						<div>
							<h3 class="text-xl font-bold">{candidate.firstName} {candidate.lastName}</h3>
							<p class="text-sm text-muted-foreground">ID: {candidate.id}</p>
						</div>
					</div>

					<Separator class="my-4" />

					<div class="space-y-2">
						<div class="flex justify-between">
							<span class="font-medium">Email:</span>
							<span>{candidate.email}</span>
						</div>
						<div class="flex justify-between">
							<span class="font-medium">Phone:</span>
							<span>{candidate.phoneNumber}</span>
						</div>
					</div>
				</CardContent>
			</Card>
		{:else}
			<!-- Placeholder for unclaimed days -->
			<Card>
				<CardHeader class="flex flex-row justify-between items-center">
					<CardTitle>Professional Details</CardTitle>
					{#if !candidate}
						<Dialog>
							<DialogTrigger
								><Button class={`gap-2 bg-[${BRAND_BASE}] hover:bg-blue-500`}
									><User class="h-5" />Assign</Button
								></DialogTrigger
							>
							<DialogContent>
								<DialogTitle>Assign Professional to Workday</DialogTitle>
							</DialogContent>
						</Dialog>
					{/if}
				</CardHeader>
				<CardContent>
					<div class="flex flex-col items-center justify-center h-40 text-center">
						<div class="text-4xl mb-2 text-muted-foreground">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-16 w-16"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
								/>
							</svg>
						</div>
						<p class="text-muted-foreground">
							{#if recurrenceDay?.recurrenceDay?.status === 'OPEN'}
								This day is available to be claimed
							{:else if recurrenceDay?.recurrenceDay?.status === 'UNFULFILLED'}
								This day was not claimed
							{:else if recurrenceDay?.recurrenceDay?.status === 'CANCELED'}
								This day has been canceled
							{:else}
								No professional assigned
							{/if}
						</p>
					</div>
				</CardContent>
			</Card>
		{/if}

		<!-- Workday/Recurrence Day Information -->
		<Card>
			<CardHeader>
				<CardTitle>{'Schedule Details'}</CardTitle>
				<CardDescription>Schedule and timing information</CardDescription>
			</CardHeader>
			<CardContent>
				<div class="space-y-4">
					<div class="bg-muted p-3 rounded-md">
						<h3 class="font-semibold mb-2">Date</h3>
						<p>{format(recurrenceDay?.recurrenceDay?.date, 'PP')}</p>
					</div>

					<div class="grid grid-cols-2 gap-4">
						<div class="bg-muted p-3 rounded-md">
							<h3 class="font-semibold mb-2">Start Time</h3>
							<p>{format(recurrenceDay?.recurrenceDay?.dayStart, 'h:mm a')}</p>
						</div>
						<div class="bg-muted p-3 rounded-md">
							<h3 class="font-semibold mb-2">End Time</h3>
							<p>{format(recurrenceDay?.recurrenceDay?.dayEnd, 'h:mm a')}</p>
						</div>
					</div>

					<div class="bg-muted p-3 rounded-md">
						<h3 class="font-semibold mb-2">Lunch Break</h3>
						{#if recurrenceDay?.recurrenceDay?.lunchStart && recurrenceDay?.recurrenceDay?.lunchEnd}
							<p>
								{format(recurrenceDay.recurrenceDay.lunchStart, 'h:mm a')} -{' '}
								{format(recurrenceDay.recurrenceDay.lunchEnd, 'h:mm a')}
							</p>
						{:else}
							<p>No lunch break scheduled</p>
						{/if}
					</div>

					<div class="flex items-center justify-between mt-4">
						<span class="font-medium">Status:</span>
						<Badge
							class={getStatusColor(recurrenceDay?.recurrenceDay?.status)}
							value={recurrenceDay?.recurrenceDay?.status}
						/>
					</div>
				</div>
			</CardContent>
		</Card>

		<!-- Requisition Information -->
		<Card>
			<CardHeader>
				<CardTitle>Requisition Details</CardTitle>
				<CardDescription>Job information and requirements</CardDescription>
			</CardHeader>
			<CardContent>
				<div class="space-y-4">
					<div>
						<h3 class="text-lg font-bold">{recurrenceDay?.requisition.disciplineName}</h3>
						<p class="text-sm text-muted-foreground">ID: {recurrenceDay?.requisition.id}</p>
					</div>

					<Separator />

					<div class="space-y-2">
						<div class="flex justify-between">
							<span class="font-medium">Company:</span>
							<span>{recurrenceDay?.requisition.companyName}</span>
						</div>
						<div class="flex justify-between">
							<span class="font-medium">Location:</span>
							<span>{recurrenceDay?.requisition.locationName}</span>
						</div>
						<div class="flex justify-between">
							<span class="font-medium">Discipline:</span>
							<span>{recurrenceDay?.requisition.disciplineName}</span>
						</div>
						<div class="flex justify-between">
							<span class="font-medium">Experience Level:</span>
							<span>{recurrenceDay?.requisition.experienceLevelName}</span>
						</div>
						<div class="flex justify-between">
							<span class="font-medium">Hourly Rate:</span>
							<span>${recurrenceDay?.requisition.hourlyRate}/hr</span>
						</div>
					</div>

					<Separator />

					<div>
						<h3 class="font-semibold mb-2">Job Description</h3>
						<p class="text-sm">{recurrenceDay?.requisition.jobDescription}</p>
					</div>

					{#if recurrenceDay?.requisition.specialInstructions}
						<div>
							<h3 class="font-semibold mb-2">Special Instructions</h3>
							<p class="text-sm">{recurrenceDay?.requisition.specialInstructions}</p>
						</div>
					{/if}

					<div class="flex items-center justify-between mt-4">
						<span class="font-medium">Status:</span>
						<Badge
							class={getStatusColor(recurrenceDay?.requisition.status)}
							value={recurrenceDay?.requisition.status}
						/>
					</div>
				</div>
			</CardContent>
		</Card>
	</div>

	<!-- Work Summary Section (only show if workday exists) -->
	{#if hasWorkday && timesheet}
		<Card>
			<CardHeader>
				<CardTitle>Work Summary</CardTitle>
			</CardHeader>
			<CardContent>
				<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
					<div class="bg-muted p-4 rounded-md flex flex-col items-center justify-center">
						<span class="text-3xl font-bold">{timesheet.totalHoursWorked || '0.0'}</span>
						<span class="text-sm text-muted-foreground">Hours Worked</span>
					</div>

					<div class="bg-muted p-4 rounded-md flex flex-col items-center justify-center">
						<span class="text-3xl font-bold">
							${timesheet.totalHoursBilled
								? (
										Number(timesheet.totalHoursBilled) *
										(recurrenceDay?.requisition?.hourlyRate || 0)
									).toFixed(2)
								: '0.00'}
						</span>
						<span class="text-sm text-muted-foreground">Total Billing</span>
					</div>

					<div class="bg-muted p-4 rounded-md flex flex-col items-center justify-center">
						{#if timesheet.status === 'APPROVED'}
							<span class="text-3xl font-bold text-green-600">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-8 w-8"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
									/>
								</svg>
							</span>
							<span class="text-sm text-muted-foreground">Timesheet Validated</span>
						{:else}
							<span class="text-3xl font-bold text-yellow-500">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-8 w-8"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
									/>
								</svg>
							</span>
							<span class="text-sm text-muted-foreground">Awaiting Validation</span>
						{/if}
					</div>
				</div>
			</CardContent>
		</Card>
	{/if}

	<!-- Dialogs -->
	<!-- <Dialog bind:open={inviteDialogOpen}>
		<DialogContent>
			<DialogHeader>
				<DialogTitle>Invite Professional for More Days</DialogTitle>
				<DialogDescription>
					Send an invitation to {candidate?.firstName}
					{candidate?.lastName} to work on more recurrence days for this requisition.
				</DialogDescription>
			</DialogHeader>

			<div class="py-4">
				<Calendar
					selected={recurrenceDay?.recurrenceDay?.date
						? new Date(recurrenceDay.recurrenceDay.date)
						: new Date()}
				/>
			</div>

			<DialogFooter>
				<Button variant="outline" on:click={() => (inviteDialogOpen = false)}>Cancel</Button>
				<Button on:click={handleInvite}>Send Invitation</Button>
			</DialogFooter>
		</DialogContent>
	</Dialog> -->
	<!--
	<AlertDialog bind:open={blacklistDialogOpen}>
		<AlertDialogContent>
			<AlertDialogHeader>
				<AlertDialogTitle>Blacklist Professional</AlertDialogTitle>
				<AlertDialogDescription>
					Are you sure you want to blacklist {candidate?.firstName}
					{candidate?.lastName}? This action cannot be undone.
				</AlertDialogDescription>
			</AlertDialogHeader>
			<AlertDialogFooter>
				<AlertDialogCancel>Cancel</AlertDialogCancel>
				<AlertDialogAction class="bg-red-500 hover:bg-red-600 text-white" on:click={handleBlacklist}
					>Confirm</AlertDialogAction
				>
			</AlertDialogFooter>
		</AlertDialogContent>
	</AlertDialog> -->
</section>
