<script lang="ts">
	import { Avatar, AvatarImage, AvatarFallback } from '$lib/components/ui/avatar';
	import {
		Card,
		CardTitle,
		CardHeader,
		CardContent,
		CardDescription
	} from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import {
		CalendarDays,
		DollarSign,
		Clock,
		MapPin,
		Phone,
		Mail,
		Check,
		AlertCircle,
		ChevronLeft,
		Loader2,
		MessageSquare,
		Printer,
		Download,
		FileText,
		Maximize2,
		X,
		Eye,
		Briefcase
	} from 'lucide-svelte';
	import type { PageData } from './$types';
	import convertNameToInitials from '$lib/_helpers/convertNameToInitials';
	import { format } from 'date-fns';
	import { superForm } from 'sveltekit-superforms/client';
	import { Badge } from '$lib/components/ui/badge';
	import { StatusBadge } from '$lib/components/ui/status-badge';

	export let data: PageData;
	$: application = data.application;

	$: console.log({ application });

	const { enhance, formId, submitting } = superForm(data.messageForm);
	const {
		enhance: approvalEnhance,
		submitting: approvalSubmitting,
		formId: approvalFormId
	} = superForm(data.approvalForm);
</script>

{#if application}
	<section class="container mx-auto px-4 py-6">
		<div class="flex flex-col gap-6">
			<!-- Header with back button and page title -->
			<div class="flex items-center gap-2">
				<Button
					variant="outline"
					size="icon"
					class="h-8 w-8"
					on:click={() => window.history.back()}
				>
					<ChevronLeft class="h-4 w-4" />
				</Button>
				<h1 class="text-3xl font-bold">Application Details</h1>
			</div>

			<!-- Candidate overview card -->
			<div class="bg-white rounded-lg shadow-sm p-6">
				<div class="flex flex-col md:flex-row gap-6 justify-between">
					<!-- Candidate info -->
					<div class="flex items-center gap-4">
						<Avatar class="h-16 w-16 md:h-20 md:w-20">
							<AvatarImage
								src={application.user.avatarUrl}
								alt={`${application.user.firstName} ${application.user.lastName}`}
							/>
							<AvatarFallback class="text-lg font-medium">
								{convertNameToInitials(application.user.firstName, application.user.lastName)}
							</AvatarFallback>
						</Avatar>

						<div>
							<h2 class="text-2xl font-bold">
								{application.user.firstName}
								{application.user.lastName}
							</h2>
							<div class="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
								<div class="flex items-center gap-2">
									<MapPin class="h-4 w-4" />
									<span>
										{[application.candidateProfile.city, application.candidateProfile.state]
											.filter(Boolean)
											.join(', ') ||
											application.candidateProfile.completeAddress ||
											'No location on file'}
									</span>
								</div>

								<div class="hidden md:flex items-center gap-2">
									<Mail class="h-4 w-4" />
									<span>{application.user.email}</span>
								</div>
							</div>
						</div>
					</div>

					<!-- Action buttons -->
					<div class="flex flex-wrap gap-3 mt-4 md:mt-0">
						<form method="POST" use:approvalEnhance class="">
							<Button
								disabled={application.application.status === 'APPROVED'}
								type="submit"
								name="approvalId"
								on:click={() => ($approvalFormId = application.application.id)}
								formaction="?/approveApplication"
								value={application.application.id}
								class="bg-green-500 hover:bg-green-600"
							>
								{#if application.application.status === 'APPROVED'}
									<Check class="h-4 w-4 mr-2" />
									Application Approved
								{:else if $approvalSubmitting}
									<Loader2 class="h-4 w-4 mr-2 animate-spin" />
									Please Wait...
								{:else}
									Approve Application
								{/if}
							</Button>
						</form>
						<form method="POST" use:enhance class="">
							<Button
								type="submit"
								name="id"
								on:click={() => ($formId = application.application.id)}
								formaction="?/startConversation"
								value={application.application.id}
								variant="outline"
							>
								{#if $submitting}
									<Loader2 class="h-4 w-4 mr-2 animate-spin" />
									Please Wait...
								{:else}
									<MessageSquare class="h-4 w-4 mr-2" />
									Start Conversation
								{/if}
							</Button>
						</form>
					</div>
				</div>

				<!-- Application status badge -->
				<div class="mt-6 flex items-center gap-2">
					<StatusBadge status={application.application.status} />

					<span class="text-sm text-muted-foreground">
						Applied on {format(application.application.createdAt, 'PPP')}
					</span>
				</div>
			</div>

			<!-- Main content section -->
			<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
				<!-- Left column - Candidate details -->
				<div class="md:col-span-2 space-y-6">
					<!-- Personal info -->
					<Card>
						<CardHeader class="pb-3">
							<CardTitle>Personal Information</CardTitle>
						</CardHeader>
						<CardContent>
							<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
								<div class="space-y-4">
									<div>
										<h3 class="text-sm font-medium text-muted-foreground">Contact Information</h3>
										<div class="mt-2 space-y-2">
											<div class="flex items-center gap-2">
												<Phone class="h-4 w-4 text-muted-foreground" />
												<span>{application.candidateProfile.cellPhone}</span>
											</div>
											<div class="flex items-center gap-2">
												<Mail class="h-4 w-4 text-muted-foreground" />
												<span>{application.user.email}</span>
											</div>
											<div class="flex items-center gap-2">
												<MapPin class="h-4 w-4 text-muted-foreground" />
												<span>
													{#if application.candidateProfile.completeAddress}
														{application.candidateProfile.completeAddress}
													{:else}
														{[
															application.candidateProfile.address,
															[application.candidateProfile.city, application.candidateProfile.state]
																.filter(Boolean)
																.join(', '),
															application.candidateProfile.zipcode
														]
															.filter(Boolean)
															.join(' ') || 'No address on file'}
													{/if}
												</span>
											</div>
										</div>
									</div>
								</div>

								<div class="space-y-4">
									<div>
										<h3 class="text-sm font-medium text-muted-foreground">Work Preferences</h3>
										<div class="mt-2 space-y-2">
											<div class="flex items-center gap-2">
												<DollarSign class="h-4 w-4 text-muted-foreground" />
												{#if application.disciplineExperience}
													<span>
														Desired Pay: ${application.disciplineExperience.preferredHourlyMin} - ${application
															.disciplineExperience.preferredHourlyMax}/hour
														{#if application.discipline?.name}
															<span class="text-muted-foreground"
																>({application.discipline.name})</span
															>
														{/if}
													</span>
												{:else}
													<span class="text-muted-foreground">No rate preference on file</span>
												{/if}
											</div>
											{#if application.experienceLevel?.value}
												<div class="flex items-center gap-2">
													<Briefcase class="h-4 w-4 text-muted-foreground" />
													<span>Experience: {application.experienceLevel.value}</span>
												</div>
											{/if}
										</div>
									</div>
								</div>
							</div>
						</CardContent>
					</Card>

					<!-- Resume -->
					{#if application.resume}
						<Card>
							<CardHeader class="pb-3">
								<CardTitle class="flex items-center justify-between">
									<span>Resume</span>
								</CardTitle>
							</CardHeader>
							<CardContent>
								<div class="border rounded-md">
									<div class="bg-muted p-4 flex justify-between items-center">
										<div class="flex items-center gap-2">
											<FileText class="h-5 w-5 text-muted-foreground" />
											<span class="font-medium">{application.resume.filename}</span>
										</div>
										<div class="flex gap-2">
											<Button
												target="__blank"
												rel="noopener noreferrer"
												href={application.resume.uploadUrl}
												variant="outline"
												size="sm"
											>
												<Eye class="h-4 w-4" />
											</Button>
										</div>
									</div>
								</div>
							</CardContent>
						</Card>
					{/if}
				</div>

				<!-- Right column - Application info -->
				<div class="space-y-6">
					<!-- Application Timeline -->
					<Card>
						<CardHeader class="pb-3">
							<CardTitle>Application Timeline</CardTitle>
						</CardHeader>
						<CardContent>
							<div class="space-y-4">
								<div class="flex items-start gap-3">
									<div
										class="mt-0.5 h-7 w-7 rounded-full bg-blue-100 flex items-center justify-center"
									>
										<FileText class="h-4 w-4 text-blue-600" />
									</div>
									<div class="space-y-1">
										<div class="flex items-center justify-between">
											<p class="font-medium">Application Submitted</p>
											<span class="text-xs text-muted-foreground">
												{format(application.application.createdAt, 'PPp')}
											</span>
										</div>
										<p class="text-sm text-muted-foreground">Candidate submitted application</p>
									</div>
								</div>

								{#if application.application.status === 'APPROVED'}
									<div class="flex items-start gap-3">
										<div
											class="mt-0.5 h-7 w-7 rounded-full bg-green-100 flex items-center justify-center"
										>
											<Check class="h-4 w-4 text-green-600" />
										</div>
										<div class="space-y-1">
											<div class="flex items-center justify-between">
												<p class="font-medium">Application Approved</p>
												<span class="text-xs text-muted-foreground">
													{format(application.application.updatedAt, 'PPp')}
												</span>
											</div>
											<p class="text-sm text-muted-foreground">Application was approved</p>
										</div>
									</div>
								{/if}

								{#if application.application.status === 'DENIED'}
									<div class="flex items-start gap-3">
										<div
											class="mt-0.5 h-7 w-7 rounded-full bg-red-100 flex items-center justify-center"
										>
											<X class="h-4 w-4 text-red-600" />
										</div>
										<div class="space-y-1">
											<div class="flex items-center justify-between">
												<p class="font-medium">Application Denied</p>
												<span class="text-xs text-muted-foreground">
													{format(application.application.updatedAt, 'PPp')}
												</span>
											</div>
											<p class="text-sm text-muted-foreground">Application was denied</p>
										</div>
									</div>
								{/if}
							</div>
						</CardContent>
					</Card>
					<!-- Candidate Experience -->
					<Card>
						<CardHeader class="pb-3">
							<CardTitle>Candidate Experience</CardTitle>
						</CardHeader>
						<CardContent>
							<div class="space-y-3">
								{#if application.disciplineExperience && application.experienceLevel && application.discipline}
									<div class="space-y-4">
										<div class="border-b pb-3 last:border-0 last:pb-0">
											<h3 class="font-medium">{application.discipline?.name}</h3>
											<p class="text-xs text-muted-foreground">
												{application.experienceLevel.value}
											</p>
										</div>
									</div>
								{:else}
									<p class="text-sm text-muted-foreground">No experience information available</p>
								{/if}
							</div>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	</section>
{:else}
	<section
		class="container mx-auto px-4 py-6 flex flex-col items-center text-center sm:justify-center gap-4 md:gap-6"
	>
		<div class="p-8 bg-gray-50 rounded-lg">
			<AlertCircle class="h-12 w-12 mx-auto text-gray-400 mb-4" />
			<h2 class="text-2xl font-bold mb-2">No Application Found</h2>
			<p class="text-gray-500 mb-6">The requested application could not be found in our system.</p>
			<Button type="button" on:click={() => window.history.back()}>Go Back</Button>
		</div>
	</section>
{/if}
