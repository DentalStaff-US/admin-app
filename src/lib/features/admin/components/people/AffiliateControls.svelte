<script lang="ts">
	import ConfirmDialog from '$dtss/ConfirmDialog.svelte';
	import Section from '$dtss/Section.svelte';
	import { statusLabel } from '$tokens/status';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import FormSelect from './FormSelect.svelte';
	import { money } from './people';

	let {
		name,
		status,
		commissionRateOverride,
		overrideReason,
		effectiveRate,
		programRate
	}: {
		/** Who this is, for the confirmation copy. */
		name: string;
		status: string;
		commissionRateOverride: string | number | null;
		overrideReason: string | null;
		effectiveRate: { ratePercent: string | number; source: string };
		programRate: string | number;
	} = $props();

	const STATUSES = ['ACTIVE', 'ON_HOLD', 'DENIED', 'PENDING'].map((s) => ({ value: s, label: statusLabel(s) }));
	const CONSEQUENCE: Record<string, string> = {
		ACTIVE: 'They earn commission on new qualifying work.',
		ON_HOLD: "New commission stops, but what they're already owed is still paid.",
		DENIED: 'This is terminal: commission stops and their balance is frozen.',
		PENDING: 'They go back to awaiting approval and earn nothing new until approved.'
	};

	let nextStatus = $state('');
	let amount = $state('');
	let statusForm = $state<HTMLFormElement>();
	let adjustForm = $state<HTMLFormElement>();
	let statusOpen = $state(false);
	let adjustOpen = $state(false);

	$effect.pre(() => {
		if (!nextStatus) nextStatus = status;
	});

	// Validate the fields first, then confirm, then post the form as it always was.
	function confirmFirst(form: HTMLFormElement | undefined, openDialog: () => void) {
		if (form?.reportValidity()) openDialog();
	}
</script>

<div class="grid items-start gap-4 lg:grid-cols-3">
	<Section title="Status" description="ON_HOLD stops new commission but still pays what's owed. DENIED is terminal and freezes the balance. Either survives the nightly eligibility sync.">
		<form bind:this={statusForm} method="POST" action="?/setStatus" class="grid gap-3">
			<div class="grid gap-1.5">
				<Label for="aff-next-status">New status</Label>
				<FormSelect id="aff-next-status" name="status" bind:value={nextStatus} options={STATUSES} />
			</div>
			<div class="grid gap-1.5">
				<Label for="aff-status-reason">Reason</Label>
				<Input id="aff-status-reason" name="reason" required minlength={3} placeholder="Required" />
			</div>
			<Button type="button" variant="outline" class="justify-self-start" on:click={() => confirmFirst(statusForm, () => (statusOpen = true))}>Update status</Button>
		</form>
	</Section>

	<Section title="Commission rate">
		<form method="POST" action="?/setRateOverride" class="grid gap-3">
			<p class="text-sm text-muted-foreground">
				Currently <strong class="text-foreground">{effectiveRate.ratePercent}%</strong>
				({effectiveRate.source === 'AFFILIATE_OVERRIDE' ? 'override' : `program default ${programRate}%`}).
				Forward-only: earned commission keeps its rate.
			</p>
			<div class="grid gap-1.5">
				<Label for="aff-rate">Override (%)</Label>
				<Input id="aff-rate" name="ratePercent" type="number" step="0.01" min="0" max="100" value={commissionRateOverride ?? ''} placeholder="Blank = program default" class="tabular-nums" />
			</div>
			<div class="grid gap-1.5">
				<Label for="aff-rate-reason">Reason</Label>
				<Input id="aff-rate-reason" name="reason" value={overrideReason ?? ''} />
			</div>
			<Button type="submit" variant="outline" class="justify-self-start">Save rate</Button>
		</form>
	</Section>

	<Section title="Manual adjustment" description="Adds a ledger row, never edits one. Positive credits, negative debits. Nets against the next payout.">
		<form bind:this={adjustForm} method="POST" action="?/adjust" class="grid gap-3">
			<div class="grid gap-1.5">
				<Label for="aff-amount">Amount ($)</Label>
				<Input id="aff-amount" name="amount" type="number" step="0.01" bind:value={amount} required placeholder="e.g. -14.50" class="tabular-nums" />
			</div>
			<div class="grid gap-1.5">
				<Label for="aff-adjust-reason">Reason (shows in the ledger)</Label>
				<Input id="aff-adjust-reason" name="reason" required minlength={3} />
			</div>
			<Button type="button" variant="outline" class="justify-self-start" on:click={() => confirmFirst(adjustForm, () => (adjustOpen = true))}>Record adjustment</Button>
		</form>
	</Section>
</div>

<ConfirmDialog
	bind:open={statusOpen}
	title="Set {name} to {statusLabel(nextStatus)}?"
	description={CONSEQUENCE[nextStatus] ?? 'Their affiliate status changes.'}
>
	{#snippet confirm()}
		<Button class="min-h-11 sm:min-h-10" variant={nextStatus === 'DENIED' ? 'destructive' : 'default'} on:click={() => statusForm?.submit()}>
			Set to {statusLabel(nextStatus)}
		</Button>
	{/snippet}
</ConfirmDialog>

<ConfirmDialog
	bind:open={adjustOpen}
	title="Record a {Number(amount) < 0 ? 'debit' : 'credit'} of {money(amount)} for {name}?"
	description="A new ledger row is added and nets against their next payout. Ledger rows can't be edited, so a mistake needs a second, opposite adjustment."
>
	{#snippet confirm()}
		<Button class="min-h-11 sm:min-h-10" on:click={() => adjustForm?.submit()}>Record adjustment</Button>
	{/snippet}
</ConfirmDialog>
