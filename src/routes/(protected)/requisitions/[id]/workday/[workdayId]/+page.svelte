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
	import { StatusBadge } from '$lib/components/ui/status-badge';
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
	} from '$lib/components/ui/alert-dialog';
	import { Avatar, AvatarFallback, AvatarImage } from '$lib/components/ui/avatar';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuItem,
		DropdownMenuLabel,
		DropdownMenuSeparator,
		DropdownMenuTrigger
	} from '$lib/components/ui/dropdown-menu';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import type { PageData } from './$types';
	import { formatInTimeZone } from 'date-fns-tz';
	import {
		Edit,
		MapPin,
		Pencil,
		UserPlus,
		X,
		XCircle,
		UserMinus,
		RefreshCw,
		ChevronDown
	} from 'lucide-svelte';
	import { enhance } from '$app/forms';
	import { USER_ROLES } from '$lib/config/constants';
	import { superForm } from 'sveltekit-superforms/client';

	export let data: PageData;

	$: user = data.user;
	$: isAdmin = user?.role === USER_ROLES.SUPERADMIN;
	$: recurrenceDay = data.recurrenceDay;
	$: workday = data.workday;
	$: candidate = workday?.candidate;
	$: timesheet = workday?.timesheet;
	$: hasWorkday = !!workday?.workday;
	$: qualifiedProfessionals = data.qualifiedProfessionals || [];
	$: editWorkdayScheduleForm = data.editWorkdayScheduleForm;

	// Dialog/modal state
	let editingSchedule = false;
	let assignDialogOpen = false;
	let reassignDialogOpen = false;
	let unassignDialogOpen = false;
	let cancelWorkdayDialogOpen = false;
	let assigningCandidateId: string | null = null;
	let reassigningCandidateId: string | null = null;

	const {
		form,
		enhance: scheduleEnhance,
		submitting: scheduleSubmitting
	} = superForm(editWorkdayScheduleForm, {
		onResult({ result }) {
			if (result.type === 'success') {
				editingSchedule = false;
			}
		}
	});

</script>

<section class="grow h-screen overflow-y-auto p-6 flex flex-col gap-6 container mx-auto">
	<div class="flex justify-between items-center flex-wrap gap-2">
		<h1 class="text-3xl font-extrabold leading-tight tracking-tighter md:text-4xl">
			Workday Details
		</h1>

		<div class="flex gap-2">
			{#if hasWorkday}
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
						<DropdownMenuItem class="gap-2" on:click={() => (editingSchedule = true)}>
							<Pencil size={16} /> Edit Schedule
						</DropdownMenuItem>
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
						{/if}
						{#if recurrenceDay?.recurrenceDay.status !== 'CANCELED'}
							<DropdownMenuItem
								class="gap-2 text-red-500 focus:text-red-500"
								on:click={() => (cancelWorkdayDialogOpen = true)}
							>
								<XCircle size={16} /> Cancel Workday
							</DropdownMenuItem>
						{/if}
					</DropdownMenuContent>
				</DropdownMenu>
			{/if}
		</div>
	</div>

	<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
		<!-- Professional Details card -->
		{#if hasWorkday && candidate}
			<Card>
				<CardHeader class="flex flex-row items-center justify-between">
					<CardTitle>Professional:</CardTitle>
					<!-- Reassign / Unassign menu (replaces the Assign button when someone is assigned) -->
					{#if isAdmin}
					<DropdownMenu>
						<DropdownMenuTrigger>
							<Button variant="outline" size="sm" class="gap-1">
								Manage
								<ChevronDown class="h-3 w-3" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem class="gap-2" on:click={() => (reassignDialogOpen = true)}>
								<RefreshCw size={16} /> Reassign
							</DropdownMenuItem>
							<DropdownMenuItem
								class="gap-2 text-red-500 focus:text-red-500"
								on:click={() => (unassignDialogOpen = true)}
							>
								<UserMinus size={16} /> Unassign
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
					{/if}
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
			<!-- Placeholder / Assign card for unoccupied days -->
			<Card>
				<CardHeader class="flex flex-row justify-between items-center">
					<CardTitle>Professional:</CardTitle>
					{#if !candidate && recurrenceDay?.recurrenceDay?.status === 'OPEN' && isAdmin}
						<Button
							class="gap-2 bg-[#2a93d1] hover:bg-blue-500"
							on:click={() => (assignDialogOpen = true)}
						>
							<UserPlus class="h-5" />Assign ({qualifiedProfessionals.length})
						</Button>
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

		<!-- Schedule Details card -->
		<Card>
			<CardHeader>
				<CardTitle class="flex items-center justify-between">
					Schedule:
					{#if isAdmin || user?.role === 'CLIENT' || user?.role === 'CLIENT_STAFF'}
						<Button
							variant="ghost"
							size="icon"
							class="h-8 w-8"
							on:click={() => (editingSchedule = !editingSchedule)}
						>
							{#if editingSchedule}
								<X class="h-4 w-4" />
							{:else}
								<Edit class="h-4 w-4" />
							{/if}
						</Button>
					{/if}
				</CardTitle>
				<CardDescription>Schedule and timing information</CardDescription>
			</CardHeader>
			<CardContent>
				{#if editingSchedule}
					<!-- Edit schedule form -->
					<form method="POST" action="?/editRecurrenceDay" use:scheduleEnhance class="space-y-4">
						<div class="space-y-1">
							<Label for="date">Date</Label>
							<Input id="date" name="date" type="date" bind:value={$form.date} required />
						</div>

						<div class="grid grid-cols-2 gap-3">
							<div class="space-y-1">
								<Label for="startTime">Start Time</Label>
								<Input
									id="startTime"
									name="startTime"
									type="time"
									bind:value={$form.startTime}
									required
								/>
							</div>
							<div class="space-y-1">
								<Label for="endTime">End Time</Label>
								<Input
									id="endTime"
									name="endTime"
									type="time"
									bind:value={$form.endTime}
									required
								/>
							</div>
						</div>

						<div class="grid grid-cols-2 gap-3">
							<div class="space-y-1">
								<Label for="lunchStartTime">Lunch Start</Label>
								<Input
									id="lunchStartTime"
									name="lunchStartTime"
									type="time"
									bind:value={$form.lunchStartTime}
								/>
							</div>
							<div class="space-y-1">
								<Label for="lunchEndTime">Lunch End</Label>
								<Input
									id="lunchEndTime"
									name="lunchEndTime"
									type="time"
									bind:value={$form.lunchEndTime}
								/>
							</div>
						</div>

						<div class="flex gap-2 pt-2">
							<Button
								type="submit"
								class="flex-1 bg-[#2a93d1] hover:bg-blue-500"
								disabled={$scheduleSubmitting}
							>
								{$scheduleSubmitting ? 'Saving...' : 'Save Changes'}
							</Button>
							<Button type="button" variant="outline" on:click={() => (editingSchedule = false)}>
								Cancel
							</Button>
						</div>
					</form>
				{:else}
					<!-- Read-only schedule view -->
					<div class="space-y-4">
						{#if recurrenceDay}
							<div class="bg-muted p-3 rounded-md">
								<h3 class="font-semibold mb-2">Date</h3>
								<p>
									{new Date(recurrenceDay?.recurrenceDay?.date).toLocaleDateString('en-US', {
										timeZone: 'UTC'
									})}
								</p>
							</div>

							<div class="grid grid-cols-2 gap-4">
								<div class="bg-muted p-3 rounded-md">
									<h3 class="font-semibold mb-2">Start Time</h3>
									<p>
										{formatInTimeZone(
											recurrenceDay?.recurrenceDay?.dayStart,
											recurrenceDay?.requisition.referenceTimezone,
											'h:mm a'
										)}
									</p>
								</div>
								<div class="bg-muted p-3 rounded-md">
									<h3 class="font-semibold mb-2">End Time</h3>
									<p>
										{formatInTimeZone(
											recurrenceDay?.recurrenceDay?.dayEnd,
											recurrenceDay?.requisition.referenceTimezone,
											'h:mm a'
										)}
									</p>
								</div>
							</div>
						{/if}

						<div class="bg-muted p-3 rounded-md">
							<h3 class="font-semibold mb-2">Lunch Break</h3>
							{#if recurrenceDay?.recurrenceDay?.lunchStart && recurrenceDay?.recurrenceDay?.lunchEnd}
								<p>
									{formatInTimeZone(
										recurrenceDay.recurrenceDay.lunchStart,
										recurrenceDay?.requisition.referenceTimezone,
										'h:mm a'
									)} –{' '}
									{formatInTimeZone(
										recurrenceDay.recurrenceDay.lunchEnd,
										recurrenceDay?.requisition.referenceTimezone,
										'h:mm a'
									)}
								</p>
							{:else}
								<p>No lunch break scheduled</p>
							{/if}
						</div>

						<div class="flex items-center justify-between mt-4">
							<span class="font-medium">Status:</span>
							<StatusBadge status={recurrenceDay?.recurrenceDay?.status} />
						</div>
					</div>
				{/if}
			</CardContent>
		</Card>

		<!-- Requisition Details card (unchanged) -->
		<Card>
			<CardHeader>
				<CardTitle>Requisition:</CardTitle>
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
							<span>{recurrenceDay?.requisition.experienceLevelName ?? 'No Preference'}</span>
						</div>
						<div class="flex justify-between items-center">
							<span class="font-medium">Hourly Rate:</span>
							<div class="flex items-center gap-2">
								{#if timesheet?.adjustedHourlyRate != null}
									<span class="font-semibold text-[#2a93d1]">
										${timesheet.adjustedHourlyRate}/hr
									</span>
									<span class="text-xs text-muted-foreground line-through">
										${recurrenceDay?.requisition.hourlyRate}/hr
									</span>
								{:else}
									<span>${recurrenceDay?.requisition.hourlyRate}/hr</span>
								{/if}
							</div>
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
						<StatusBadge status={recurrenceDay?.requisition.status} />
					</div>
				</div>
			</CardContent>
		</Card>
	</div>

	<!-- Work Summary (only when workday + timesheet exist) -->
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
										(timesheet?.adjustedHourlyRate ?? recurrenceDay?.requisition?.hourlyRate ?? 0)
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
</section>

<!-- ─── Assign Dialog (used for first-time assign) ─────────────────────────── -->
<Dialog bind:open={assignDialogOpen}>
	<DialogContent class="max-w-2xl max-h-[80vh] overflow-y-auto">
		<DialogHeader>
			<DialogTitle>Assign Professional to Workday</DialogTitle>
			<DialogDescription>
				{qualifiedProfessionals.length} qualified professionals within 50 miles
			</DialogDescription>
		</DialogHeader>
		<div class="space-y-4 mt-4">
			{#each qualifiedProfessionals as professional}
				<div class="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
					<div class="flex items-start justify-between">
						<div class="flex gap-4">
							<Avatar class="h-12 w-12">
								<AvatarImage src={professional.avatarUrl} alt={professional.firstName} />
								<AvatarFallback>
									{professional.firstName?.[0]}{professional.lastName?.[0]}
								</AvatarFallback>
							</Avatar>
							<div class="flex-1">
								<h3 class="font-semibold text-lg">
									{professional.firstName}
									{professional.lastName}
								</h3>
								<p class="text-sm text-muted-foreground">{professional.email}</p>
								<div class="flex gap-4 mt-2 text-sm">
									<span class="flex items-center gap-1">
										<MapPin class="h-3 w-3" />
										{professional.distance} mi away
									</span>
								</div>
								<div class="flex gap-2 mt-2">
									<Badge variant="outline" value={professional.disciplineAbbr} />
								</div>
							</div>
						</div>
						<form
							method="POST"
							action="?/assignCandidate"
							use:enhance={() => {
								assigningCandidateId = professional.candidateId;
								return async ({ result, update }) => {
									assigningCandidateId = null;
									if (result.type === 'success') {
										assignDialogOpen = false;
										await update();
									} else {
										await update();
									}
								};
							}}
						>
							<input type="hidden" name="candidateId" value={professional.candidateId} />
							<input type="hidden" name="recurrenceDayId" value={recurrenceDay?.recurrenceDay.id} />
							<Button
								class="bg-blue-500 hover:bg-blue-600"
								type="submit"
								size="sm"
								disabled={assigningCandidateId === professional.candidateId}
							>
								{assigningCandidateId === professional.candidateId ? 'Assigning...' : 'Assign'}
							</Button>
						</form>
					</div>
				</div>
			{:else}
				<div class="text-center py-8 text-muted-foreground">
					No qualified professionals found within 50 miles
				</div>
			{/each}
		</div>
	</DialogContent>
</Dialog>

<!-- ─── Reassign Dialog ────────────────────────────────────────────────────── -->
<Dialog bind:open={reassignDialogOpen}>
	<DialogContent class="max-w-2xl max-h-[80vh] overflow-y-auto">
		<DialogHeader>
			<DialogTitle>Reassign Professional</DialogTitle>
			<DialogDescription>
				Currently assigned to <strong>{candidate?.firstName} {candidate?.lastName}</strong>. Select
				a replacement from {qualifiedProfessionals.length} qualified professionals within 50 miles.
			</DialogDescription>
		</DialogHeader>
		<div class="space-y-4 mt-4">
			{#each qualifiedProfessionals as professional}
				<!-- Skip the currently assigned candidate -->
				{#if professional.candidateId !== candidate?.id}
					<div class="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
						<div class="flex items-start justify-between">
							<div class="flex gap-4">
								<Avatar class="h-12 w-12">
									<AvatarImage src={professional.avatarUrl} alt={professional.firstName} />
									<AvatarFallback>
										{professional.firstName?.[0]}{professional.lastName?.[0]}
									</AvatarFallback>
								</Avatar>
								<div class="flex-1">
									<h3 class="font-semibold text-lg">
										{professional.firstName}
										{professional.lastName}
									</h3>
									<p class="text-sm text-muted-foreground">{professional.email}</p>
									<div class="flex gap-4 mt-2 text-sm">
										<span class="flex items-center gap-1">
											<MapPin class="h-3 w-3" />
											{professional.distance} mi away
										</span>
									</div>
									<div class="flex gap-2 mt-2">
										<Badge variant="outline" value={professional.disciplineAbbr} />
									</div>
								</div>
							</div>
							<form
								method="POST"
								action="?/reassignRecurrenceDay"
								use:enhance={() => {
									reassigningCandidateId = professional.candidateId;
									return async ({ result, update }) => {
										reassigningCandidateId = null;
										if (result.type === 'success') {
											reassignDialogOpen = false;
											await update();
										} else {
											await update();
										}
									};
								}}
							>
								<input type="hidden" name="candidateId" value={professional.candidateId} />
								<input
									type="hidden"
									name="recurrenceDayId"
									value={recurrenceDay?.recurrenceDay.id}
								/>
								<Button
									class="bg-blue-500 hover:bg-blue-600"
									type="submit"
									size="sm"
									disabled={reassigningCandidateId === professional.candidateId}
								>
									{reassigningCandidateId === professional.candidateId
										? 'Reassigning...'
										: 'Reassign'}
								</Button>
							</form>
						</div>
					</div>
				{/if}
			{:else}
				<div class="text-center py-8 text-muted-foreground">
					No other qualified professionals found within 50 miles
				</div>
			{/each}
		</div>
		<DialogFooter>
			<Button variant="outline" on:click={() => (reassignDialogOpen = false)}>Cancel</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>

<!-- ─── Unassign Confirm Dialog ────────────────────────────────────────────── -->
<AlertDialog bind:open={unassignDialogOpen}>
	<AlertDialogContent>
		<AlertDialogHeader>
			<AlertDialogTitle>Unassign Professional</AlertDialogTitle>
			<AlertDialogDescription>
				Are you sure you want to unassign <strong
					>{candidate?.firstName} {candidate?.lastName}</strong
				>? This will delete the associated workday and timesheet, and the day will return to
				<strong>Open</strong> status.
			</AlertDialogDescription>
		</AlertDialogHeader>
		<AlertDialogFooter>
			<AlertDialogCancel>Cancel</AlertDialogCancel>
			<form
				method="POST"
				action="?/unassignCandidate"
				use:enhance={() => {
					return async ({ result, update }) => {
						if (result.type === 'success') {
							unassignDialogOpen = false;
							await update();
						} else {
							await update();
						}
					};
				}}
			>
				<input type="hidden" name="recurrenceDayId" value={recurrenceDay?.recurrenceDay.id} />
				<AlertDialogAction type="submit" class="bg-red-500 hover:bg-red-600 text-white">
					Unassign
				</AlertDialogAction>
			</form>
		</AlertDialogFooter>
	</AlertDialogContent>
</AlertDialog>

<!-- ─── Cancel Workday Confirm Dialog ─────────────────────────────────────── -->
<AlertDialog bind:open={cancelWorkdayDialogOpen}>
	<AlertDialogContent>
		<AlertDialogHeader>
			<AlertDialogTitle>Cancel Workday</AlertDialogTitle>
			<AlertDialogDescription>
				Are you sure you want to cancel this workday? This will remove any assigned professional and
				cannot be undone.
			</AlertDialogDescription>
		</AlertDialogHeader>
		<AlertDialogFooter>
			<AlertDialogCancel>Cancel</AlertDialogCancel>
			<form
				method="POST"
				action="?/cancelWorkday"
				use:enhance={() => {
					return async ({ result, update }) => {
						if (result.type === 'success') {
							cancelWorkdayDialogOpen = false;
							await update();
						} else {
							await update();
						}
					};
				}}
			>
				<input type="hidden" name="recurrenceDayId" value={recurrenceDay?.recurrenceDay.id} />
				<AlertDialogAction type="submit" class="bg-red-500 hover:bg-red-600 text-white">
					Cancel Workday
				</AlertDialogAction>
			</form>
		</AlertDialogFooter>
	</AlertDialogContent>
</AlertDialog>
