<script lang="ts">
	import { format } from 'date-fns';
	import * as Avatar from '$lib/components/ui/avatar';
	import { Badge } from '$lib/components/ui/badge';
	import { StatusBadge } from '$lib/components/ui/status-badge';
	import { Button } from '$lib/components/ui/button';
	import {
		Card,
		CardContent,
		CardDescription,
		CardFooter,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import { Separator } from '$lib/components/ui/separator';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { cn } from '$lib/utils';
	import type { PageData } from './$types';
	import { Loader } from 'lucide-svelte';
	import { superForm } from 'sveltekit-superforms/client';
	import { enhance } from '$app/forms';
	import { USER_ROLES } from '$lib/config/constants';

	export let data: PageData;
	$: user = data.user;
	$: ticket = data.ticket;
	$: comments = ticket.comments || [];

	let newComment = '';

	function getTimeAgo(date: Date) {
		const now = new Date();
		const diffMs = now.getTime() - new Date(date).getTime();
		const diffSecs = Math.floor(diffMs / 1000);
		const diffMins = Math.floor(diffSecs / 60);
		const diffHours = Math.floor(diffMins / 60);
		const diffDays = Math.floor(diffHours / 24);

		if (diffDays > 0) {
			return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
		} else if (diffHours > 0) {
			return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
		} else if (diffMins > 0) {
			return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
		} else {
			return 'Just now';
		}
	}

	function handleAddComment() {
		// Add your comment submission logic here
		if (newComment.trim()) {
			console.log('Adding comment:', newComment);
			newComment = '';
		}
	}

	function handleCloseTicket() {
		// Add your close ticket logic here
		console.log('Closing ticket');
	}

	const {
		form: commentForm,
		enhance: commentFormEnhance,
		submitting: commentFormSubmitting
	} = superForm(data.commentForm, {
		resetForm: true
	});
</script>

<section class="container mx-auto px-4 py-6 space-y-8">
	<!-- Page Header -->
	<h1 class="text-3xl font-extrabold leading-tight tracking-tighter md:text-4xl">Support Ticket</h1>

	<!-- Ticket Header with title and status -->
	<div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
		<div>
			<div class="flex items-center gap-2 mb-2">
				<h2 class="text-2xl font-bold leading-tight">
					{ticket.details.ticket.title}
				</h2>
				<StatusBadge status={ticket.details.ticket.status} />
			</div>
			<p class="text-sm text-muted-foreground">
				Ticket #{ticket.details.ticket.id.slice(0, 8)} • Submitted on: {format(
					new Date(ticket.details.ticket.createdAt),
					'PPp'
				)}
			</p>
		</div>

		<div class="flex gap-2 items-center">
			{#if ticket.details.ticket.status !== 'CLOSED'}
				<form action="?/closeTicket" method="post" use:enhance>
					<Button type="submit" variant="outline">Close Ticket</Button>
				</form>
			{/if}
			{#if user.role === USER_ROLES.SUPERADMIN && ticket.details.ticket.status === 'CLOSED'}
				<form action="?/reopenTicket" method="post" use:enhance>
					<Button variant="outline" type="submit">Reopen Ticket</Button>
				</form>
			{/if}
		</div>
	</div>

	<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
		<!-- Left column: Ticket information -->
		<div class="md:col-span-2 space-y-6">
			<!-- Reported Issue Card -->
			<Card>
				<CardHeader>
					<CardTitle>Reported Issue</CardTitle>
					<CardDescription>Details about the issue being reported</CardDescription>
				</CardHeader>
				<CardContent class="space-y-6">
					<!-- Expected vs Actual -->
					<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div class="space-y-2">
							<h3 class="font-semibold text-sm">Expected Results</h3>
							<div class="bg-muted p-3 rounded-md text-sm min-h-24">
								{ticket.details.ticket.expectedResult || 'No expected results provided'}
							</div>
						</div>
						<div class="space-y-2">
							<h3 class="font-semibold text-sm">Actual Results</h3>
							<div class="bg-muted p-3 rounded-md text-sm min-h-24">
								{ticket.details.ticket.actualResults || 'No actual results provided'}
							</div>
						</div>
					</div>

					<!-- Steps to Reproduce -->
					<div class="space-y-2">
						<h3 class="font-semibold text-sm">Steps to Reproduce</h3>
						<div class="bg-muted p-3 rounded-md text-sm">
							{#if ticket.details.ticket.stepsToReproduce}
								<div class="whitespace-pre-line">{ticket.details.ticket.stepsToReproduce}</div>
							{:else}
								<p>No steps to reproduce provided</p>
							{/if}
						</div>
					</div>
				</CardContent>
			</Card>

			<!-- Comments Section -->
			<Card>
				<CardHeader>
					<CardTitle>Comments ({comments.length})</CardTitle>
					<CardDescription>Conversation history about this issue</CardDescription>
				</CardHeader>
				<CardContent>
					{#if comments.length === 0}
						<div class="text-center p-6 text-muted-foreground">
							<p>No comments yet</p>
						</div>
					{:else}
						<div class="space-y-6">
							{#each comments as commentItem}
								<div class="flex gap-4">
									<Avatar.Root class="h-10 w-10">
										<Avatar.Image src={commentItem.user?.avatarUrl} />
										<Avatar.Fallback
											>{commentItem.user?.firstName?.[0]}{commentItem.user
												?.lastName?.[0]}</Avatar.Fallback
										>
									</Avatar.Root>
									<div class="flex-1 space-y-1">
										<div class="flex items-center justify-between">
											<div class="flex items-center gap-2">
												<span class="font-semibold"
													>{commentItem.user?.firstName} {commentItem.user?.lastName}</span
												>
												<Badge
													variant="outline"
													class="text-xs"
													value={commentItem.user?.role.replace('_', ' ')}
												/>
											</div>
											<span class="text-xs text-muted-foreground">
												{getTimeAgo(commentItem.comment.createdAt)}
											</span>
										</div>
										<div class="rounded-md bg-muted p-3 text-sm">
											{commentItem.comment.body}
										</div>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</CardContent>

				{#if ticket.details.ticket.status !== 'CLOSED'}
					<CardFooter>
						<form class="w-full" action="?/addComment" use:commentFormEnhance method="post">
							<div class="w-full space-y-2">
								<Textarea
									name="body"
									bind:value={$commentForm.body}
									placeholder="Add a comment..."
									class="min-h-24 w-full"
								/>
								<div class="flex justify-end">
									<Button type="submit" disabled={$commentFormSubmitting}>
										{#if $commentFormSubmitting}
											<Loader class="h-5 w-5 animate-spin" />
											Adding Comment
										{:else}
											Post Comment
										{/if}
									</Button>
								</div>
							</div>
						</form>
					</CardFooter>
				{/if}
			</Card>
		</div>

		<!-- Right column: Sidebar with user info and metadata -->
		<div class="space-y-6">
			<!-- Reporter Information -->
			<Card>
				<CardHeader>
					<CardTitle>Reporter</CardTitle>
				</CardHeader>
				<CardContent>
					<div class="flex items-center gap-4">
						<Avatar.Root class="h-16 w-16">
							<Avatar.Image src={ticket.details.reportedBy?.avatarUrl} />
							<Avatar.Fallback
								>{ticket.details.reportedBy?.firstName?.[0]}{ticket.details.reportedBy
									?.lastName?.[0]}</Avatar.Fallback
							>
						</Avatar.Root>
						<div>
							<p class="font-semibold">
								{ticket.details.reportedBy?.firstName}
								{ticket.details.reportedBy?.lastName}
							</p>
							<p class="text-sm text-muted-foreground">{ticket.details.reportedBy?.email}</p>
							<Badge
								class="mt-1"
								variant="outline"
								value={ticket.details.reportedBy?.role.replace('_', ' ')}
							/>
						</div>
					</div>
				</CardContent>
			</Card>

			<!-- Ticket Status & Metadata -->
			<Card>
				<CardHeader>
					<CardTitle>Ticket Info</CardTitle>
				</CardHeader>
				<CardContent>
					<div class="space-y-4">
						<div>
							<p class="text-sm text-muted-foreground">Status</p>
							<StatusBadge status={ticket.details.ticket.status} />
						</div>

						<div>
							<p class="text-sm text-muted-foreground">Created</p>
							<p class="font-medium">{format(new Date(ticket.details.ticket.createdAt), 'PPp')}</p>
						</div>

						{#if ticket.details.ticket.status === 'CLOSED' && ticket.details.closedBy}
							<div>
								<p class="text-sm text-muted-foreground">Closed by</p>
								<div class="flex items-center gap-2 mt-1">
									<Avatar.Root class="h-6 w-6">
										<Avatar.Image src={ticket.details.closedBy?.avatarUrl} />
										<Avatar.Fallback
											>{ticket.details.closedBy?.firstName?.[0]}{ticket.details.closedBy
												?.lastName?.[0]}</Avatar.Fallback
										>
									</Avatar.Root>
									<span
										>{ticket.details.closedBy?.firstName} {ticket.details.closedBy?.lastName}</span
									>
								</div>
							</div>

							<div>
								<p class="text-sm text-muted-foreground">Closed on</p>
								<p class="font-medium">
									{format(new Date(ticket.details.ticket.updatedAt), 'PPp')}
								</p>
							</div>
						{/if}
					</div>
				</CardContent>
			</Card>
		</div>
	</div>
</section>
