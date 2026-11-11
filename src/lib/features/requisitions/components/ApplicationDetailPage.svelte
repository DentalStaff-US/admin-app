<!--
  One application (or admin recommendation) on a request: the professional,
  contact details, résumé, and the Approve / Deny decision. The route's
  +page.svelte renders this with its page data unchanged.
-->
<script lang="ts">
	/* eslint-disable @typescript-eslint/no-explicit-any */
	import { enhance as formEnhance } from '$app/forms';
	import { page } from '$app/stores';
	import { format } from 'date-fns';
	import { superForm } from 'sveltekit-superforms/client';
	import { Briefcase, Check, Eye, FileText, Loader2, Mail, MapPin, MessageSquare, Phone, SearchX, UserRound, X } from 'lucide-svelte';
	import ConfirmDialog from '$dtss/ConfirmDialog.svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import FactGrid from '$dtss/FactGrid.svelte';
	import Notice from '$dtss/Notice.svelte';
	import Page from '$dtss/Page.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';
	import Section from '$dtss/Section.svelte';
	import StatusBadge from '$dtss/StatusBadge.svelte';
	import Timeline, { type TimelineEntry } from '$dtss/Timeline.svelte';
	import * as Avatar from '$lib/components/ui/avatar';
	import { Button } from '$lib/components/ui/button';
	import ActivityLog from '$lib/components/audit/ActivityLog.svelte';
	import convertNameToInitials from '$lib/_helpers/convertNameToInitials';
	import { USER_ROLES } from '$lib/config/constants';

	/** The application route's page data (see its +page.server.ts). */
	let {
		data,
		requisitionId: requisitionIdProp
	}: {
		data: Record<string, any>;
		/** Defaults to the route's `id` param. */
		requisitionId?: string | number;
	} = $props();

	const application = $derived(data.application);
	const app = $derived(application?.application);
	const profile = $derived(application?.candidateProfile);
	const isAdmin = $derived(data.user?.role === USER_ROLES.SUPERADMIN);
	const requisitionId = $derived(requisitionIdProp ?? $page.params.id);
	const noun = 'Requisition';
	const name = $derived(application ? `${application.user.firstName ?? ''} ${application.user.lastName ?? ''}`.trim() : '');
	const recommended = $derived(app?.source === 'ADMIN_RECOMMENDED');

	const cityState = $derived(
		profile ? [profile.city, profile.state].filter(Boolean).join(', ') || profile.completeAddress || 'Not on file' : '—'
	);
	const address = $derived(
		profile
			? profile.completeAddress ||
					[profile.address, [profile.city, profile.state].filter(Boolean).join(', '), profile.zipcode]
						.filter(Boolean)
						.join(' ') ||
					'No address on file'
			: '—'
	);
	const pay = $derived(
		application?.disciplineExperience
			? `$${application.disciplineExperience.preferredHourlyMin}–$${application.disciplineExperience.preferredHourlyMax}/hr`
			: 'Not on file'
	);

	const timeline = $derived<TimelineEntry[]>(
		app
			? [
					...(app.status === 'APPROVED'
						? [{ id: 'approved', at: app.updatedAt, text: 'Application approved', tone: 'positive' as const }]
						: []),
					...(app.status === 'DENIED'
						? [{ id: 'denied', at: app.updatedAt, text: 'Application denied', tone: 'negative' as const }]
						: []),
					{
						id: 'submitted',
						at: app.createdAt,
						text: recommended ? 'Recommended by our team' : 'Application submitted',
						tone: 'info' as const
					}
				]
			: []
	);

	let approveOpen = $state(false);
	let denyOpen = $state(false);
	let denying = $state(false);

	const { enhance, formId, submitting } = superForm(data.messageForm);
	const {
		enhance: approvalEnhance,
		submitting: approvalSubmitting,
		formId: approvalFormId
	} = superForm(data.approvalForm);
</script>

{#if application}
	<Page>
		<PageHeader title={name} description={`Applied to ${noun.toLowerCase()} #${requisitionId}`}>
			{#snippet actions()}
				<form method="POST" use:enhance>
					<Button
						type="submit"
						name="id"
						variant="outline"
						formaction="?/startConversation"
						value={app.id}
						on:click={() => ($formId = app.id)}
					>
						{#if $submitting}
							<Loader2 class="mr-2 size-4 animate-spin" aria-hidden="true" /> Opening…
						{:else}
							<MessageSquare class="mr-2 size-4" aria-hidden="true" /> Message
						{/if}
					</Button>
				</form>
				{#if app.status === 'PENDING'}
					<Button variant="destructiveOutline" on:click={() => (denyOpen = true)}>
						<X class="mr-2 size-4" aria-hidden="true" /> Deny…
					</Button>
				{/if}
				{#if app.status !== 'APPROVED'}
					<Button on:click={() => (approveOpen = true)}>
						<Check class="mr-2 size-4" aria-hidden="true" /> Approve…
					</Button>
				{/if}
			{/snippet}
		</PageHeader>

		<div class="-mt-3 flex flex-wrap items-center gap-2 text-sm">
			<StatusBadge status={app.status} />
			{#if recommended}
				<span class="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary-dark">Recommended</span>
			{/if}
			<span class="text-muted-foreground">Applied {format(app.createdAt, 'PPP')}</span>
			<span aria-hidden="true" class="text-muted-foreground">·</span>
			<a href={`/requisitions/${requisitionId}`} class="font-semibold text-primary-dark hover:underline">{noun} #{requisitionId}</a>
		</div>

		{#if recommended}
			<Notice title="Recommended by our team">
				{#if app.recommendationNote}
					<p class="whitespace-pre-wrap">{app.recommendationNote}</p>
				{:else}
					<p>We've vetted this professional and they've agreed to be considered for this role.</p>
				{/if}
				{#if isAdmin}
					<p class="mt-2 text-muted-foreground">
						Recommended by {data.recommendedBy ?? 'an admin'}{app.candidateConsentAt
							? ` · consent confirmed ${format(app.candidateConsentAt, 'PPp')}`
							: ''}
					</p>
				{/if}
			</Notice>
		{/if}

		<FactGrid
			facts={[
				{ label: 'Location', value: cityState },
				{ label: 'Discipline', value: application.discipline?.name ?? '—' },
				{ label: 'Experience', value: application.experienceLevel?.value ?? '—' },
				{ label: 'Desired pay', value: pay }
			]}
		/>

		<div class="grid gap-6 lg:grid-cols-3">
			<div class="space-y-6 lg:col-span-2">
				<Section title="Contact">
					<div class="flex items-center gap-4">
						<Avatar.Root class="size-14">
							{#if application.user.avatarUrl}<Avatar.Image src={application.user.avatarUrl} alt="" />{/if}
							<Avatar.Fallback class="bg-gradient-to-br from-pro to-primary font-bold text-white">
								{convertNameToInitials(application.user.firstName, application.user.lastName)}
							</Avatar.Fallback>
						</Avatar.Root>
						<dl class="min-w-0 flex-1 space-y-2 text-sm">
							<div class="flex items-center gap-2">
								<dt><Phone class="size-4 text-muted-foreground" aria-label="Phone" /></dt>
								<dd class="tabular-nums">{profile.cellPhone ?? '—'}</dd>
							</div>
							<div class="flex items-center gap-2">
								<dt><Mail class="size-4 text-muted-foreground" aria-label="Email" /></dt>
								<dd class="truncate">{application.user.email}</dd>
							</div>
							<div class="flex items-center gap-2">
								<dt><MapPin class="size-4 text-muted-foreground" aria-label="Address" /></dt>
								<dd>{address}</dd>
							</div>
						</dl>
					</div>
				</Section>

				<Section title="Résumé">
					{#if application.resume}
						<div class="flex flex-wrap items-center justify-between gap-3">
							<p class="flex min-w-0 items-center gap-2 font-medium">
								<FileText class="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
								<span class="truncate">{application.resume.filename}</span>
							</p>
							<Button variant="outline" size="sm" href={application.resume.uploadUrl} target="_blank" rel="noopener noreferrer">
								<Eye class="mr-2 size-4" aria-hidden="true" /> View
							</Button>
						</div>
					{:else}
						<p class="text-sm text-muted-foreground">No résumé uploaded.</p>
					{/if}
				</Section>
			</div>

			<div class="space-y-6">
				<Section title="Timeline">
					<Timeline entries={timeline} />
				</Section>
				{#if isAdmin}
					<Section title="For admins">
						<div class="flex flex-col gap-2">
							<Button variant="outline" class="justify-start" href={`/professionals/${profile.id}`}>
								<UserRound class="mr-2 size-4" aria-hidden="true" /> Full professional profile
							</Button>
							<Button variant="outline" class="justify-start" href={`/requisitions/${requisitionId}`}>
								<Briefcase class="mr-2 size-4" aria-hidden="true" /> Back to requisition #{requisitionId}
							</Button>
						</div>
					</Section>
				{/if}
			</div>
		</div>

		{#if isAdmin}
			<Section title="Activity" description="Every view and action on this application.">
				<ActivityLog entries={data.activity ?? []} />
			</Section>
		{/if}
	</Page>

	<ConfirmDialog
		bind:open={approveOpen}
		title={`Approve ${name}?`}
		description={`${name} is notified that they got the role. On a permanent requisition any other pending applicants are declined and notified, and the requisition moves to Payment required; a temp requisition is closed.`}
	>
		{#snippet confirm()}
			<form method="POST" action="?/approveApplication" use:approvalEnhance>
				<Button
					type="submit"
					name="approvalId"
					value={app.id}
					class="min-h-11 w-full sm:min-h-10 sm:w-auto"
					disabled={$approvalSubmitting}
					on:click={() => ($approvalFormId = app.id)}
				>
					{$approvalSubmitting ? 'Approving…' : `Approve ${application.user.firstName ?? ''}`.trim()}
				</Button>
			</form>
		{/snippet}
	</ConfirmDialog>

	<ConfirmDialog
		bind:open={denyOpen}
		title={`Deny ${name}'s application?`}
		description={`${name} is notified that they weren't selected for this role.`}
		cancelLabel="Keep application"
	>
		{#snippet confirm()}
			<form
				method="POST"
				action="?/denyApplication"
				use:formEnhance={() => {
					denying = true;
					return async ({ update }) => {
						denying = false;
						denyOpen = false;
						await update();
					};
				}}
			>
				<Button type="submit" variant="destructive" class="min-h-11 w-full sm:min-h-10 sm:w-auto" disabled={denying}>
					{denying ? 'Denying…' : 'Deny application'}
				</Button>
			</form>
		{/snippet}
	</ConfirmDialog>
{:else}
	<Page width="narrow">
		<PageHeader title="Application not found" />
		<EmptyState icon={SearchX} title="We couldn't find this application" description="It may belong to another requisition, or the link is out of date.">
			<Button href={`/requisitions/${requisitionId}`}>Back to {noun.toLowerCase()} #{requisitionId}</Button>
		</EmptyState>
	</Page>
{/if}
