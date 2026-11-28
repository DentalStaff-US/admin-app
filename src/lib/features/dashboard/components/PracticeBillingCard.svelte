<script lang="ts">
	// Billing for a practice owner (10 §4.1): what's on its way to an invoice,
	// what's owed, what's overdue and what was paid this month. Every row links
	// to the list it counts. Omitted entirely when billing isn't this user's.
	import Hint from '$dtss/Hint.svelte';
	import Section from '$dtss/Section.svelte';
	import { cn } from '$lib/utils';
	import { DASH, formatMoneyTile } from '../format';
	import { FAILED_HINT } from '../metrics';
	import type { Metric, PracticeBilling } from '../types';

	let { billing }: { billing: Metric<PracticeBilling> } = $props();

	const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
</script>

{#snippet row(href: string, label: string, hint: string, value: string, detail: string | null, tone: 'negative' | null = null)}
	<li>
		<a {href} class="flex items-baseline justify-between gap-4 py-3 hover:underline">
			<span class="text-sm text-muted-foreground"><Hint text={hint}>{label}</Hint></span>
			<span class="text-right">
				<span class={cn('block text-xl font-extrabold tabular-nums', tone === 'negative' && 'text-status-negative-fg')}>{value}</span>
				{#if detail}<span class="text-xs text-muted-foreground">{detail}</span>{/if}
			</span>
		</a>
	</li>
{/snippet}

<Section title="Billing">
	{#if !billing.ok}
		<p class="text-sm text-muted-foreground"><Hint text={FAILED_HINT}>{DASH}</Hint> Couldn't load billing. Refresh to try again.</p>
	{:else}
		{@const b = billing.value}
		<ul class="divide-y">
			{@render row(
				'/timesheets?tab=review',
				'Awaiting your approval',
				'Submitted timesheets and expense claims. Approving a timesheet creates its invoice.',
				b.timesheetsAwaiting || b.expensesPendingCount ? plural(b.timesheetsAwaiting, 'timesheet') : 'Nothing',
				b.expensesPendingCount ? `+ ${plural(b.expensesPendingCount, 'expense')} (${formatMoneyTile(b.expensesPending)})` : null
			)}
			{@render row(
				'/invoices?tab=open',
				'Owed',
				'Unpaid invoices, including any past their due date.',
				formatMoneyTile(b.due),
				b.dueCount ? plural(b.dueCount, 'open invoice') : null
			)}
			{#if b.overdueCount > 0}
				{@render row(
					'/invoices?tab=overdue',
					'Overdue',
					'Unpaid invoices past their due date.',
					formatMoneyTile(b.overdue),
					plural(b.overdueCount, 'invoice'),
					'negative'
				)}
			{/if}
			{@render row('/invoices?tab=paid', 'Paid this month', 'Invoices paid since the 1st of this month.', formatMoneyTile(b.paidThisMonth), null)}
		</ul>
	{/if}
</Section>
