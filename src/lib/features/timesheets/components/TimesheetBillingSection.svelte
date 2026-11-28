<script lang="ts">
	/**
	 * Rate, admin fee and the invoice preview. Admins can set an adjusted rate
	 * and a negotiated fee (short forms → Dialog) until the sheet is billed; the
	 * fee itself is resolved server-side (resolveAdminFeeForDisplay).
	 */
	import { Pencil } from 'lucide-svelte';
	import Section from '$dtss/Section.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { cn } from '$lib/utils';
	import FormDialog from './FormDialog.svelte';
	import { feeText, hoursText, usd, type BillingSummary } from '../timesheets';

	type FeeType = 'PERCENTAGE' | 'FIXED';
	type FeeSettings = {
		amount: number;
		type: FeeType;
		source: 'OVERRIDE' | 'PLATFORM' | string;
		label: string;
		overrideAmount: string | number | null;
		overrideType: FeeType | null;
		platformAmount: string | number;
		platformType: FeeType;
		frozen: boolean;
	};

	let {
		summary,
		baseRate,
		adjustedRate = null,
		fee,
		priorWeekHours = 0,
		approvedExpenseCount = 0,
		pendingExpenseCount = 0,
		admin = false,
		canEditRate = false,
		canEditFee = false
	}: {
		summary: BillingSummary;
		baseRate: number | string | null | undefined;
		adjustedRate?: number | null;
		fee: FeeSettings;
		priorWeekHours?: number;
		approvedExpenseCount?: number;
		pendingExpenseCount?: number;
		admin?: boolean;
		canEditRate?: boolean;
		canEditFee?: boolean;
	} = $props();

	let rateOpen = $state(false);
	let rateValue = $state<number | null>(null);
	let feeOpen = $state(false);
	let feeValue = $state<number | null>(null);
	let feeType = $state<FeeType>('PERCENTAGE');

	const hasOverride = $derived(fee.source === 'OVERRIDE');
	const feeDiffersFromPlatform = $derived(
		Number(fee.platformAmount) !== fee.amount || fee.platformType !== fee.type
	);
	const effectiveRate = $derived(Number(adjustedRate ?? baseRate ?? 0));

	function openRate() {
		rateValue = adjustedRate;
		rateOpen = true;
	}
	function openFee() {
		// Start from where the fee stands: the override if any, else the platform.
		feeValue = fee.overrideAmount !== null ? Number(fee.overrideAmount) : Number(fee.platformAmount);
		feeType = fee.overrideType ?? fee.platformType;
		feeOpen = true;
	}
</script>

<Section title="Billing" description={fee.frozen ? 'As billed at approval.' : 'Preview of the invoice approval will create.'}>
	<dl class="divide-y text-sm">
		<div class="flex items-center justify-between gap-3 pb-3">
			<dt class="text-muted-foreground">Hourly rate</dt>
			<dd class="flex items-center gap-2 font-semibold tabular-nums">
				{#if adjustedRate !== null && adjustedRate !== undefined}
					<span class="text-sm font-normal text-muted-foreground line-through">{usd(Number(baseRate ?? 0))}</span>
				{/if}
				{usd(effectiveRate)}
				{#if admin && canEditRate}
					<Button variant="ghost" size="icon" class="size-8" aria-label="Edit hourly rate" on:click={openRate}>
						<Pencil class="size-4" aria-hidden="true" />
					</Button>
				{/if}
			</dd>
		</div>
		<div class="flex items-center justify-between gap-3 py-3">
			<dt class="text-muted-foreground">
				Admin fee
				{#if fee.frozen}<span class="block text-xs">As billed</span>{:else if hasOverride}<span class="block text-xs text-primary-dark">Agreed rate</span>{/if}
			</dt>
			<dd class="flex items-center gap-2 font-semibold tabular-nums">
				{#if hasOverride && feeDiffersFromPlatform}
					<span class="text-sm font-normal text-muted-foreground line-through">{feeText(fee.platformAmount, fee.platformType)}</span>
				{/if}
				{feeText(fee.amount, fee.type)}
				{#if admin && canEditFee}
					<Button variant="ghost" size="icon" class="size-8" aria-label="Edit admin fee" on:click={openFee}>
						<Pencil class="size-4" aria-hidden="true" />
					</Button>
				{/if}
			</dd>
		</div>

		<div class="space-y-2 py-3">
			{#if summary.overtimeHours > 0}
				{#if summary.regularHours > 0}
					<div class="flex justify-between gap-3">
						<dt class="text-muted-foreground">Regular ({hoursText(summary.regularHours)} h)</dt>
						<dd class="tabular-nums">{usd(summary.regularAmount)}</dd>
					</div>
				{/if}
				<div class="flex justify-between gap-3">
					<dt class="text-muted-foreground">
						Overtime ({hoursText(summary.overtimeHours)} h × 1.5)
						{#if priorWeekHours > 0}<span class="block text-xs">Week already at {hoursText(priorWeekHours)} h on earlier timesheets</span>{/if}
					</dt>
					<dd class="tabular-nums">{usd(summary.overtimeAmount)}</dd>
				</div>
			{:else}
				<div class="flex justify-between gap-3">
					<dt class="text-muted-foreground">Hours ({hoursText(summary.regularHours)} h)</dt>
					<dd class="tabular-nums">{usd(summary.subtotal)}</dd>
				</div>
			{/if}
			{#if approvedExpenseCount > 0}
				<div class="flex justify-between gap-3">
					<dt class="text-muted-foreground">Approved expenses ({approvedExpenseCount})</dt>
					<dd class="tabular-nums">{usd(summary.expensesTotal)}</dd>
				</div>
			{/if}
			<div class="flex justify-between gap-3">
				<dt class="text-muted-foreground">
					{fee.label}
					{#if fee.type === 'PERCENTAGE'}<span class="block text-xs">Applies to regular hours</span>{/if}
				</dt>
				<dd class="tabular-nums">{usd(summary.adminFeeAmount)}</dd>
			</div>
		</div>

		<div class="flex items-baseline justify-between gap-3 pt-3 text-base font-bold">
			<dt>Invoice total</dt>
			<dd class="tabular-nums">{usd(summary.total)}</dd>
		</div>
	</dl>
	{#if pendingExpenseCount > 0}
		<p class="mt-3 text-sm font-semibold text-status-warning-fg">
			{pendingExpenseCount} pending expense{pendingExpenseCount === 1 ? '' : 's'} must be resolved before this timesheet can be approved.
		</p>
	{/if}
</Section>

{#if admin}
	<FormDialog bind:open={rateOpen} title="Adjust the hourly rate" description="Bill this timesheet at a different rate than the requisition's {usd(Number(baseRate ?? 0))}/h. Leave it blank to use the requisition's rate." action="?/setAdjustedHourlyRate" submitLabel="Save rate">
		<div class="space-y-2">
			<Label for="adjusted-rate">Hourly rate ($)</Label>
			<Input id="adjusted-rate" name="adjustedHourlyRate" type="number" min="0" inputmode="decimal" placeholder={String(baseRate ?? '')} bind:value={rateValue} />
		</div>
	</FormDialog>

	<FormDialog bind:open={feeOpen} title="Set the admin fee" description="A fee agreed for this timesheet only. Leave the amount blank to use the platform rate ({feeText(fee.platformAmount, fee.platformType)})." action="?/setAdminFeeOverride" submitLabel="Save fee">
		<fieldset class="space-y-2">
			<legend class="text-sm font-semibold">Fee type</legend>
			<div class="inline-flex rounded-md bg-muted p-1" role="radiogroup" aria-label="Fee type">
				{#each [['PERCENTAGE', 'Percent'], ['FIXED', 'Flat $']] as [value, label] (value)}
					<button
						type="button"
						role="radio"
						aria-checked={feeType === value}
						class={cn(
							'h-8 rounded-sm px-3 text-sm font-semibold text-muted-foreground',
							feeType === value && 'bg-background text-foreground shadow-card'
						)}
						onclick={() => (feeType = value as FeeType)}>{label}</button
					>
				{/each}
			</div>
			<input type="hidden" name="adminFeeTypeOverride" value={feeType} />
		</fieldset>
		<div class="space-y-2">
			<Label for="admin-fee">{feeType === 'PERCENTAGE' ? 'Fee (%)' : 'Fee ($)'}</Label>
			<Input id="admin-fee" name="adminFeeOverride" type="number" min="0" step="0.01" inputmode="decimal" placeholder={String(fee.platformAmount)} bind:value={feeValue} />
			{#if feeValue !== null && feeType === 'PERCENTAGE' && fee.platformType === 'PERCENTAGE' && feeValue > Number(fee.platformAmount)}
				<p class="text-sm font-semibold text-status-warning-fg">Higher than the platform rate ({fee.platformAmount}%).</p>
			{/if}
		</div>
	</FormDialog>
{/if}
