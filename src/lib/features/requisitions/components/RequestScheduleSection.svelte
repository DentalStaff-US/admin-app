<script lang="ts">
	import { enhance } from '$app/forms';
	import { CalendarClock, ChevronDown, MoreHorizontal, Trash2, UserRound, X, XCircle } from 'lucide-svelte';
	import { formatInTimeZone } from 'date-fns-tz';
	import type { Snippet } from 'svelte';
	import ConfirmDialog from '$dtss/ConfirmDialog.svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import Section from '$dtss/Section.svelte';
	import StatusBadge from '$dtss/StatusBadge.svelte';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { shouldShowProfessional } from '$lib/_helpers/assignment';
	import { cn } from '$lib/utils';

	type Day = {
		id: string;
		date: string;
		dayStart: Date | string;
		dayEnd: Date | string;
		lunchStart?: Date | string | null;
		lunchEnd?: Date | string | null;
		status: string;
		workdayCancelledAt: Date | string | null;
		professional: { candidateId: string; firstName: string | null; lastName: string | null; avatarUrl: string | null } | null;
	};

	let {
		requisitionId,
		days,
		timezone,
		isAdmin,
		canManage,
		addDays
	}: {
		requisitionId: number;
		days: Day[];
		timezone: string;
		isAdmin: boolean;
		/** hasRequisitionRights: cancel, bulk actions and adding days. */
		canManage: boolean;
		/** The "Add days" sheet trigger. */
		addDays?: Snippet;
	} = $props();

	const FILTERS = ['ALL', 'OPEN', 'FILLED', 'UNFULFILLED', 'CANCELED'] as const;
	type Filter = (typeof FILTERS)[number];
	let filter = $state<Filter>('ALL');
	const visible = $derived(filter === 'ALL' ? days : days.filter((d) => d.status === filter));
	const countOf = (f: Filter) => (f === 'ALL' ? days.length : days.filter((d) => d.status === f).length);

	// Selection is scoped to what's visible, so a bulk action never touches
	// rows the person can't see.
	let selected = $state<Set<string>>(new Set());
	$effect(() => {
		const ids = new Set(visible.map((d) => d.id));
		const kept = [...selected].filter((id) => ids.has(id));
		if (kept.length !== selected.size) selected = new Set(kept);
	});
	const allSelected = $derived(visible.length > 0 && visible.every((d) => selected.has(d.id)));
	function toggle(id: string) {
		const next = new Set(selected);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selected = next;
	}
	const toggleAll = () => (selected = allSelected ? new Set() : new Set(visible.map((d) => d.id)));
	const ids = $derived([...selected].join(','));

	// Shared with the workday page: a workday row outlives its assignment.
	const professional = (d: Day) =>
		d.professional && shouldShowProfessional({ cancelledAt: d.workdayCancelledAt }, d.status) ? d.professional : null;
	const nameOf = (p: NonNullable<Day['professional']>) => `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim();
	const initials = (p: NonNullable<Day['professional']>) => `${p.firstName?.[0] ?? ''}${p.lastName?.[0] ?? ''}` || '?';
	const dateLabel = (d: Day) =>
		new Date(`${d.date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
	const time = (v: Date | string) => formatInTimeZone(new Date(v), timezone, 'h:mmaaa');

	// Confirmations (03 › Which overlay): every cancel, delete and bulk change.
	let pending = $state<Day | null>(null);
	let cancelOpen = $state(false);
	let deleteOpen = $state(false);
	let bulkStatus = $state<'OPEN' | 'FILLED' | 'UNFULFILLED' | null>(null);
	let bulkStatusOpen = $state(false);
	let bulkCancelOpen = $state(false);
	let bulkDeleteOpen = $state(false);
	let submitting = $state(false);

	const submit = (after?: () => void) => () => {
		submitting = true;
		return async ({ result, update }: { result: { type: string }; update: () => Promise<void> }) => {
			submitting = false;
			cancelOpen = deleteOpen = bulkStatusOpen = bulkCancelOpen = bulkDeleteOpen = false;
			if (result.type === 'success') after?.();
			await update();
		};
	};
	const clearSelection = () => (selected = new Set());
	const pendingWho = $derived(pending ? professional(pending) : null);
	const plural = (n: number) => `${n} day${n === 1 ? '' : 's'}`;
</script>

<Section title="Schedule" description={`Times are in the practice's timezone (${timezone.replace(/_/g, ' ')}).`}>
	{#snippet actions()}
		{#if canManage && addDays}{@render addDays()}{/if}
	{/snippet}

	{#if days.length === 0}
		<EmptyState icon={CalendarClock} title="No days scheduled" description="Add the days you need covered and qualified professionals are notified." />
	{:else}
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div role="group" aria-label="Show days" class="inline-flex flex-wrap gap-1 rounded-md bg-muted p-1">
				{#each FILTERS as f (f)}
					<button
						type="button"
						aria-pressed={filter === f}
						onclick={() => (filter = f)}
						class={cn(
							'inline-flex h-8 items-center gap-2 rounded-sm px-3 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
							filter === f && 'bg-background text-foreground shadow-card'
						)}
					>
						{f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
						<span class="text-xs font-bold tabular-nums">{countOf(f)}</span>
					</button>
				{/each}
			</div>
			{#if canManage && visible.length > 0}
				<label class="flex min-h-10 items-center gap-2 text-sm font-semibold">
					<Checkbox checked={allSelected ? true : selected.size ? 'indeterminate' : false} onCheckedChange={toggleAll} aria-label="Select all visible days" />
					Select all
				</label>
			{/if}
		</div>

		{#if canManage && selected.size > 0}
			<div class="mt-4 flex flex-wrap items-center gap-2 rounded-lg bg-primary-soft px-4 py-3">
				<span class="text-sm font-semibold">{plural(selected.size)} selected</span>
				<div class="ml-auto flex flex-wrap gap-2">
					<DropdownMenu.Root>
						<DropdownMenu.Trigger class={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1 bg-background')}>
							Set status <ChevronDown class="size-3.5" aria-hidden="true" />
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end">
							{#each ['OPEN', 'FILLED', 'UNFULFILLED'] as const as s (s)}
								<DropdownMenu.Item class="min-h-10 cursor-pointer" on:click={() => { bulkStatus = s; bulkStatusOpen = true; }}>
									{s.charAt(0) + s.slice(1).toLowerCase()}…
								</DropdownMenu.Item>
							{/each}
						</DropdownMenu.Content>
					</DropdownMenu.Root>
					<Button variant="destructiveOutline" size="sm" class="gap-1 bg-background" on:click={() => (bulkCancelOpen = true)}>
						<X class="size-3.5" aria-hidden="true" /> Cancel…
					</Button>
					{#if isAdmin}
						<Button variant="destructiveOutline" size="sm" class="gap-1 bg-background" on:click={() => (bulkDeleteOpen = true)}>
							<Trash2 class="size-3.5" aria-hidden="true" /> Delete…
						</Button>
					{/if}
					<Button variant="ghost" size="sm" on:click={clearSelection}>Clear</Button>
				</div>
			</div>
		{/if}

		{#if visible.length === 0}
			<p class="mt-6 rounded-xl border border-dashed bg-muted/30 py-8 text-center text-sm text-muted-foreground">
				No {filter.toLowerCase()} days.
			</p>
		{:else}
			<!-- Days as cards (03 › ShiftCard, admin variant: shows the professional). -->
			<ul class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
				{#each visible as day (day.id)}
					{@const pro = professional(day)}
					<li
						class={cn(
							'relative rounded-xl border bg-card p-4 transition hover:border-primary/40 hover:shadow-lift',
							selected.has(day.id) && 'border-primary/60 bg-primary-soft/40'
						)}
					>
						<div class="flex items-start gap-3">
							{#if canManage}
								<div class="relative z-10 pt-0.5">
									<Checkbox checked={selected.has(day.id)} onCheckedChange={() => toggle(day.id)} aria-label="Select {dateLabel(day)}" />
								</div>
							{/if}
							<div class="min-w-0 flex-1">
								<div class="flex items-start justify-between gap-2">
									<a
										href={`/requisitions/${requisitionId}/workday/${day.id}`}
										class="font-bold after:absolute after:inset-0 after:rounded-xl after:content-[''] hover:underline focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
									>
										{dateLabel(day)}
									</a>
									<StatusBadge status={day.status} />
								</div>
								<p class="mt-0.5 text-sm tabular-nums text-muted-foreground">
									{[`${time(day.dayStart)}–${time(day.dayEnd)}`, day.lunchStart && day.lunchEnd ? `lunch ${time(day.lunchStart)}–${time(day.lunchEnd)}` : null].filter(Boolean).join(' · ')}
								</p>
								<div class="mt-3 flex items-center justify-between gap-2">
									{#if pro}
										<span class="flex min-w-0 items-center gap-2 text-sm">
											{#if pro.avatarUrl}
												<img src={pro.avatarUrl} alt="" class="size-8 rounded-full object-cover" />
											{:else}
												<span class="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-pro to-pro-dark text-xs font-bold text-white">{initials(pro)}</span>
											{/if}
											<span class="truncate font-semibold">{nameOf(pro)}</span>
											{#if day.workdayCancelledAt}<span class="text-xs text-muted-foreground">(canceled)</span>{/if}
										</span>
									{:else}
										<span class="flex items-center gap-2 text-sm text-muted-foreground">
											<UserRound class="size-4" aria-hidden="true" /> Unassigned
										</span>
									{/if}
									{#if (canManage && day.status !== 'CANCELED') || isAdmin}
										<div class="relative z-10">
											<DropdownMenu.Root>
												<DropdownMenu.Trigger class={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'size-9')} aria-label="Actions for {dateLabel(day)}">
													<MoreHorizontal class="size-4" aria-hidden="true" />
												</DropdownMenu.Trigger>
												<DropdownMenu.Content align="end">
													<DropdownMenu.Item class="min-h-10 cursor-pointer" href={`/requisitions/${requisitionId}/workday/${day.id}`}>Open day</DropdownMenu.Item>
													{#if canManage && day.status !== 'CANCELED'}
														<DropdownMenu.Item class="min-h-10 cursor-pointer gap-2 text-destructive data-[highlighted]:text-destructive" on:click={() => { pending = day; cancelOpen = true; }}>
															<XCircle class="size-4" aria-hidden="true" /> Cancel day…
														</DropdownMenu.Item>
													{/if}
													{#if isAdmin}
														<DropdownMenu.Separator />
														<DropdownMenu.Item class="min-h-10 cursor-pointer gap-2 text-destructive data-[highlighted]:text-destructive" on:click={() => { pending = day; deleteOpen = true; }}>
															<Trash2 class="size-4" aria-hidden="true" /> Delete day…
														</DropdownMenu.Item>
													{/if}
												</DropdownMenu.Content>
											</DropdownMenu.Root>
										</div>
									{/if}
								</div>
							</div>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</Section>

<ConfirmDialog
	bind:open={cancelOpen}
	title={`Cancel ${pending ? dateLabel(pending) : 'this day'}?`}
	description={pendingWho
		? `${nameOf(pendingWho)} will be notified and the day's hours come off their timesheet. This can't be undone.`
		: "The day is canceled and no one can claim it. This can't be undone."}
	cancelLabel="Keep day"
>
	{#snippet confirm()}
		<form method="POST" action="?/cancelRecurrenceDay" use:enhance={submit()}>
			<input type="hidden" name="recurrenceDayId" value={pending?.id ?? ''} />
			<Button type="submit" variant="destructive" class="w-full sm:w-auto" disabled={submitting}>{submitting ? 'Canceling…' : 'Cancel day'}</Button>
		</form>
	{/snippet}
</ConfirmDialog>

<ConfirmDialog
	bind:open={deleteOpen}
	title={`Delete ${pending ? dateLabel(pending) : 'this day'}?`}
	description={`The day is removed from the schedule${pendingWho ? ` and ${nameOf(pendingWho)} is notified` : ''}. Its history is kept for the audit log.`}
>
	{#snippet confirm()}
		<!-- Posts a one-element list to the bulk action: admin-gated and audit-logged per day. -->
		<form method="POST" action="?/bulkDeleteRecurrenceDays" use:enhance={submit()}>
			<input type="hidden" name="ids" value={pending?.id ?? ''} />
			<Button type="submit" variant="destructive" class="w-full sm:w-auto" disabled={submitting}>{submitting ? 'Deleting…' : 'Delete day'}</Button>
		</form>
	{/snippet}
</ConfirmDialog>

<ConfirmDialog
	bind:open={bulkStatusOpen}
	title={`Mark ${plural(selected.size)} ${bulkStatus?.toLowerCase() ?? ''}?`}
	description="This only changes the status. No one is notified; use Cancel to cancel days and tell the professional."
>
	{#snippet confirm()}
		<form method="POST" action="?/bulkUpdateRecurrenceDayStatus" use:enhance={submit(clearSelection)}>
			<input type="hidden" name="ids" value={ids} />
			<input type="hidden" name="status" value={bulkStatus ?? ''} />
			<Button type="submit" class="w-full sm:w-auto" disabled={submitting}>{submitting ? 'Updating…' : 'Update status'}</Button>
		</form>
	{/snippet}
</ConfirmDialog>

<ConfirmDialog
	bind:open={bulkCancelOpen}
	title={`Cancel ${plural(selected.size)}?`}
	description="Assigned professionals are notified and the hours come off their timesheets. Started shifts can't be canceled. This can't be undone."
	cancelLabel="Keep days"
>
	{#snippet confirm()}
		<form method="POST" action="?/bulkCancelRecurrenceDays" use:enhance={submit(clearSelection)}>
			<input type="hidden" name="ids" value={ids} />
			<Button type="submit" variant="destructive" class="w-full sm:w-auto" disabled={submitting}>{submitting ? 'Canceling…' : `Cancel ${plural(selected.size)}`}</Button>
		</form>
	{/snippet}
</ConfirmDialog>

<ConfirmDialog
	bind:open={bulkDeleteOpen}
	title={`Delete ${plural(selected.size)}?`}
	description="The days and their timesheet entries are removed from the schedule and assigned professionals are notified. History is kept for the audit log."
>
	{#snippet confirm()}
		<form method="POST" action="?/bulkDeleteRecurrenceDays" use:enhance={submit(clearSelection)}>
			<input type="hidden" name="ids" value={ids} />
			<Button type="submit" variant="destructive" class="w-full sm:w-auto" disabled={submitting}>{submitting ? 'Deleting…' : `Delete ${plural(selected.size)}`}</Button>
		</form>
	{/snippet}
</ConfirmDialog>
