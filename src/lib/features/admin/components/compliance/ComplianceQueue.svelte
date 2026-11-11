<script lang="ts">
	import { enhance } from '$app/forms';
	import { CalendarX, ShieldCheck, SlidersHorizontal } from 'lucide-svelte';
	import DataTable from '$dtss/DataTable.svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import Hint from '$dtss/Hint.svelte';
	import IconSquare from '$dtss/IconSquare.svelte';
	import Notice from '$dtss/Notice.svelte';
	import { TONE_CLASSES } from '$tokens/status';
	import TabsWithCounts from '$dtss/TabsWithCounts.svelte';
	import type { DataColumn } from '$dtss/tableState';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { SEVERITY_LABELS, type ComplianceSeverity } from '$lib/config/compliance';
	import HintButton from './HintButton.svelte';
	import SnoozeMenu from './SnoozeMenu.svelte';
	import { complianceTabs, reminderHint, SEVERITY_HINTS, SEVERITY_TONE, type ComplianceRow } from './compliance';

	let {
		items,
		counts,
		snoozedCount,
		severity,
		showSnoozed,
		loadError = null,
		href
	}: {
		items: ComplianceRow[];
		counts: Record<ComplianceSeverity, number>;
		snoozedCount: number;
		severity: ComplianceSeverity | null;
		showSnoozed: boolean;
		/** A failed load never renders the all-clear (10 W1). */
		loadError?: string | null;
		/** URL for a severity / snoozed filter, keeping the other in place. */
		href: (severity: ComplianceSeverity | null, snoozed: boolean) => string;
	} = $props();

	const tabs = $derived(complianceTabs(counts, severity, (s) => href(s, showSnoozed)));
	const keyOf = (row: ComplianceRow) => row.subjectId + row.ruleKey;

	// One in-flight action at a time per row and kind.
	let pending = $state<string | null>(null);
	const submitting = (key: string, after?: () => void) => () => {
		pending = key;
		return async ({ result, update }: { result: { type: string }; update: () => Promise<void> }) => {
			await update();
			pending = null;
			if (result.type === 'success') after?.();
		};
	};

	// Snooze: pick a length inline, then confirm naming who and until when.
	let snoozing = $state<{ row: ComplianceRow; days: number } | null>(null);
	let snoozeOpen = $state(false);
	let note = $state('');
	function pickSnooze(row: ComplianceRow, days: number) {
		snoozing = { row, days };
		note = '';
		snoozeOpen = true;
	}
	const snoozeUntil = $derived(
		snoozing
			? new Date(Date.now() + snoozing.days * 864e5).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
			: ''
	);

	const columns: DataColumn<ComplianceRow>[] = [
		{ id: 'professional', header: 'Professional', cell: professional },
		{ id: 'credential', header: 'Credential', cell: credential },
		{ id: 'severity', header: 'Severity', cell: severityCell },
		{ id: 'shifts', header: 'Booked shifts', cell: shifts },
		{ id: 'actions', header: 'Actions', srOnlyHeader: true, cell: actions, class: 'w-px whitespace-nowrap' }
	];
</script>

{#snippet professional(row: ComplianceRow)}{row.subjectName}{/snippet}

{#snippet credential(row: ComplianceRow)}
	<p class="font-semibold">{row.title}</p>
	<p class="text-sm text-muted-foreground">{row.detail}</p>
	{#if row.snoozedUntil}<p class="text-caption text-muted-foreground">Snoozed until {row.snoozedUntil}</p>{/if}
{/snippet}

{#snippet severityCell(row: ComplianceRow)}
	<span class="inline-flex items-center gap-1.5">
		{#if row.severity === 'CRITICAL'}<CalendarX class="size-4 text-destructive" aria-hidden="true" />{/if}
		<!-- Severity tones aren't in the shared statusMap yet (10 W3), so the pill is built from TONE_CLASSES. -->
		<Hint text={SEVERITY_HINTS[row.severity]} class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold {TONE_CLASSES[SEVERITY_TONE[row.severity]]}">
			{SEVERITY_LABELS[row.severity]}
		</Hint>
	</span>
{/snippet}

{#snippet shifts(row: ComplianceRow)}
	{#if row.upcomingShifts.length}
		<!-- Future shifts, so the workday page's unassign/reassign is allowed. -->
		<ul class="space-y-0.5 text-sm">
			{#each row.upcomingShifts.slice(0, 4) as s (s.recurrenceDayId)}
				<li>
					<a href="/requisitions/{s.requisitionId}/workday/{s.recurrenceDayId}" class="font-semibold text-primary-dark hover:underline">
						{s.date} · #{s.requisitionId}
					</a>
				</li>
			{/each}
			{#if row.upcomingShifts.length > 4}<li class="text-muted-foreground">+{row.upcomingShifts.length - 4} more</li>{/if}
		</ul>
	{:else}
		<span class="text-muted-foreground"><span aria-hidden="true">—</span><span class="sr-only">None</span></span>
	{/if}
{/snippet}

{#snippet actions(row: ComplianceRow)}
	{@const key = keyOf(row)}
	<div class="flex flex-wrap items-center justify-end gap-2 md:flex-nowrap">
		{#if row.remindable}
			<form method="POST" action="?/sendReminder" use:enhance={submitting(key + 'r')}>
				<input type="hidden" name="candidateId" value={row.subjectId} />
				<input type="hidden" name="ruleKey" value={row.ruleKey} />
				<HintButton type="submit" hint={reminderHint(row.remindedAt)} disabled={!!row.remindedAt || pending === key + 'r'}>
					{row.remindedAt ? 'Reminded' : pending === key + 'r' ? 'Sending…' : 'Remind'}
				</HintButton>
			</form>
		{/if}
		{#if row.snoozedUntil}
			<form method="POST" action="?/unsnooze" use:enhance={submitting(key + 'u')}>
				<input type="hidden" name="candidateId" value={row.subjectId} />
				<input type="hidden" name="ruleKey" value={row.ruleKey} />
				<HintButton type="submit" variant="ghost" hint="Puts it back in the queue and the dashboard count now." disabled={pending === key + 'u'}>
					Un-snooze
				</HintButton>
			</form>
		{:else if row.severity === 'CRITICAL'}
			<HintButton hint={SEVERITY_HINTS.CRITICAL} disabled>Snooze</HintButton>
		{:else}
			<SnoozeMenu subject={row.subjectName} on:pick={(e) => pickSnooze(row, e.detail)} />
		{/if}
	</div>
{/snippet}

{#snippet mobile(row: ComplianceRow)}
	<div class="space-y-2">
		<div class="flex items-start justify-between gap-3">
			<div class="min-w-0">
				<p class="font-semibold">{row.subjectName}</p>
				<p class="text-sm">{row.title}</p>
			</div>
			{@render severityCell(row)}
		</div>
		<p class="text-sm text-muted-foreground">{row.detail}</p>
		{#if row.upcomingShifts.length}
			<p class="text-sm"><span class="font-semibold">Booked:</span> {row.upcomingShifts.map((s) => s.date).slice(0, 3).join(', ')}{row.upcomingShifts.length > 3 ? '…' : ''}</p>
		{/if}
		<!-- Above the row link, so the buttons stay clickable. -->
		<div class="relative z-10 flex justify-start">{@render actions(row)}</div>
	</div>
{/snippet}

{#snippet tabsSnippet()}
	<div class="flex flex-wrap items-center justify-between gap-3 pb-3">
		<TabsWithCounts label="Filter by severity" active={severity ?? 'ALL'} {tabs} />
		<a href={href(severity, !showSnoozed)} data-sveltekit-noscroll class="text-sm font-semibold text-primary-dark underline-offset-4 hover:underline">
			{showSnoozed ? 'Hide snoozed' : `Show snoozed (${snoozedCount})`}
		</a>
	</div>
{/snippet}

{#snippet empty()}
	{#if showSnoozed}
		<EmptyState icon={SlidersHorizontal} title="Nothing snoozed" description="Snoozed items come back to the queue on their date. None are waiting.">
			<Button variant="outline" href={href(severity, false)}>Back to the queue</Button>
		</EmptyState>
	{:else if severity}
		<EmptyState icon={SlidersHorizontal} title="Nothing at “{SEVERITY_LABELS[severity]}”" description="No professional is at this severity right now.">
			<Button variant="outline" href={href(null, false)}>Show all severities</Button>
		</EmptyState>
	{:else}
		<!-- 10 §3.6 all-clear: positive tone, only ever from a successful load. -->
		<div class="flex flex-col items-center rounded-xl border border-dashed bg-muted/30 px-6 py-10 text-center">
			<IconSquare icon={ShieldCheck} tone="positive" />
			<h3 class="mt-4 text-h3">Everyone's credentials are current</h3>
			<p class="mt-1 max-w-sm text-sm text-muted-foreground">
				{snoozedCount > 0 ? `${snoozedCount} snoozed item${snoozedCount === 1 ? '' : 's'} will come back on their date.` : 'Nothing needs attention.'}
			</p>
		</div>
	{/if}
{/snippet}

{#if loadError}
	<Notice tone="warning" title="Couldn't check compliance">
		{loadError} Refresh to try again. Until then, don't assume everyone is compliant.
	</Notice>
{:else}
	<DataTable
		rows={items}
		{columns}
		key={keyOf}
		rowHref={(row) => `/professionals/${row.subjectId}`}
		rowLabel={(row) => `${row.subjectName}: ${row.title}`}
		caption="Professionals whose credentials need attention"
		tabs={tabsSnippet}
		{empty}
		{mobile}
	/>
{/if}

<AlertDialog.Root bind:open={snoozeOpen}>
	<AlertDialog.Content>
		{#if snoozing}
			{@const row = snoozing.row}
			<form
				method="POST"
				action="?/snooze"
				class="space-y-4"
				use:enhance={submitting(keyOf(row) + 's', () => (snoozeOpen = false))}
			>
				<AlertDialog.Header>
					<AlertDialog.Title>Snooze {row.subjectName}'s {row.title.toLowerCase()} for {snoozing.days} days?</AlertDialog.Title>
					<AlertDialog.Description>
						It leaves this queue and the dashboard count until {snoozeUntil}, then comes back if it's still unresolved.
						Nobody is notified.
					</AlertDialog.Description>
				</AlertDialog.Header>
				<input type="hidden" name="candidateId" value={row.subjectId} />
				<input type="hidden" name="ruleKey" value={row.ruleKey} />
				<input type="hidden" name="days" value={snoozing.days} />
				<div class="space-y-2">
					<Label for="snooze-note">Note <span class="font-normal text-muted-foreground">(optional)</span></Label>
					<Input id="snooze-note" name="note" maxlength={500} bind:value={note} placeholder="e.g. renewal in progress" />
				</div>
				<AlertDialog.Footer class="gap-2">
					<AlertDialog.Cancel type="button">Go back</AlertDialog.Cancel>
					<Button type="submit" disabled={pending === keyOf(row) + 's'}>Snooze {snoozing.days} days</Button>
				</AlertDialog.Footer>
			</form>
		{/if}
	</AlertDialog.Content>
</AlertDialog.Root>
