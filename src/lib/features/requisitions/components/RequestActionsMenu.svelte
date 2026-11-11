<script lang="ts">
	import { enhance } from '$app/forms';
	import { Ban, CheckCircle2, ChevronDown, Clock, CreditCard, Globe, Lock, RotateCcw } from 'lucide-svelte';
	import ConfirmDialog from '$dtss/ConfirmDialog.svelte';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import { TIMEZONES } from '$lib/config/constants';
	import { cn } from '$lib/utils';

	type Status = 'OPEN' | 'CLOSED' | 'CANCELED' | 'PAYMENT_REQUIRED' | 'PAYMENT_RECEIVED';

	let {
		requisitionId,
		status,
		permanent,
		isAdmin,
		noun,
		timezone,
		onCreateInvoice
	}: {
		requisitionId: number;
		status: string;
		permanent: boolean;
		isAdmin: boolean;
		/** The word for a posting in user-facing copy. */
		noun: string;
		timezone: string;
		onCreateInvoice?: () => void;
	} = $props();

	// Each status change names the object and its consequence (03 › Which overlay).
	const COPY: Record<Status, { label: string; title: string; description: string; confirm: string; destructive?: boolean }> = $derived({
		OPEN: {
			label: `Reopen ${noun}`,
			title: `Reopen this ${noun}?`,
			description: permanent
				? 'It goes back on the job board and professionals can apply again.'
				: 'It shows as open again. Days that were closed stay closed; add new days to fill.',
			confirm: 'Reopen'
		},
		CLOSED: {
			label: `Close ${noun}…`,
			title: `Close this ${noun}?`,
			description: permanent
				? 'It comes off the job board and no one else can apply.'
				: 'Upcoming open days are closed and no one else can claim them. Filled days stay as they are.',
			confirm: `Close ${noun}`
		},
		CANCELED: {
			label: `Cancel ${noun}…`,
			title: `Cancel this ${noun}?`,
			description: permanent
				? "It comes off the job board and no one else can apply. Applicants aren't notified automatically."
				: 'Upcoming open days are closed, and professionals with shifts on this requisition get a text that it was canceled.',
			confirm: `Cancel ${noun}`,
			destructive: true
		},
		PAYMENT_REQUIRED: {
			label: 'Mark payment required…',
			title: 'Mark the placement fee as due?',
			description: 'The requisition moves to payment required and shows as unbilled until an invoice is raised.',
			confirm: 'Mark payment required'
		},
		PAYMENT_RECEIVED: {
			label: 'Mark fee received…',
			title: 'Mark the placement fee as received?',
			description: 'Record that the practice paid. This completes the hiring lifecycle for this requisition.',
			confirm: 'Mark received'
		}
	});

	const options = $derived(
		(['OPEN', 'CLOSED', 'CANCELED'] as Status[])
			.concat(isAdmin && permanent ? ['PAYMENT_REQUIRED', 'PAYMENT_RECEIVED'] : [])
			.filter((s) => s !== status)
	);
	const ICON = { OPEN: RotateCcw, CLOSED: Lock, CANCELED: Ban, PAYMENT_REQUIRED: Clock, PAYMENT_RECEIVED: CheckCircle2 };

	let next = $state<Status | null>(null);
	let confirmOpen = $state(false);
	let submitting = $state(false);
	const copy = $derived(next ? COPY[next] : null);

	let timezoneOpen = $state(false);
	let tz = $state(timezone);
	$effect(() => {
		if (timezoneOpen) tz = timezone;
	});
	const tzOptions = $derived(
		TIMEZONES.some((t) => t.name === timezone) ? TIMEZONES : [...TIMEZONES, { name: timezone, label: timezone }]
	);
	const tzLabel = (name: string) => tzOptions.find((t) => t.name === name)?.label ?? name;
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger class={cn(buttonVariants({ variant: 'outline' }), 'gap-2')}>
		Actions <ChevronDown class="size-4" aria-hidden="true" />
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end" class="w-60">
		{#if isAdmin && permanent && onCreateInvoice}
			<DropdownMenu.Item class="min-h-10 cursor-pointer gap-2" on:click={onCreateInvoice}>
				<CreditCard class="size-4" aria-hidden="true" /> Create invoice…
			</DropdownMenu.Item>
		{/if}
		{#if isAdmin}
			<DropdownMenu.Item class="min-h-10 cursor-pointer gap-2" on:click={() => (timezoneOpen = true)}>
				<Globe class="size-4" aria-hidden="true" /> Change timezone…
			</DropdownMenu.Item>
			<DropdownMenu.Separator />
		{/if}
		{#each options as s (s)}
			{@const Icon = ICON[s]}
			<DropdownMenu.Item
				class={cn('min-h-10 cursor-pointer gap-2', COPY[s].destructive && 'text-destructive data-[highlighted]:text-destructive')}
				on:click={() => {
					next = s;
					confirmOpen = true;
				}}
			>
				<Icon class="size-4" aria-hidden="true" /> {COPY[s].label}
			</DropdownMenu.Item>
		{/each}
	</DropdownMenu.Content>
</DropdownMenu.Root>

<ConfirmDialog bind:open={confirmOpen} title={copy?.title ?? ''} description={copy?.description ?? ''}>
	{#snippet confirm()}
		<form
			method="POST"
			action="?/changeStatus"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					submitting = false;
					confirmOpen = false;
					await update();
				};
			}}
		>
			<input type="hidden" name="requisitionId" value={requisitionId} />
			<input type="hidden" name="status" value={next ?? ''} />
			<Button type="submit" variant={copy?.destructive ? 'destructive' : 'default'} class="w-full sm:w-auto" disabled={submitting}>
				{submitting ? 'Updating…' : copy?.confirm}
			</Button>
		</form>
	{/snippet}
</ConfirmDialog>

{#if isAdmin}
	<!-- Short form → Dialog. Manual correction for a request pinned to the wrong
	     zone; upcoming shifts are re-based so their local times stay put. -->
	<Dialog.Root bind:open={timezoneOpen}>
		<Dialog.Content class="sm:max-w-lg">
			<Dialog.Header>
				<Dialog.Title class="text-h2">Change timezone</Dialog.Title>
				<Dialog.Description>
					Normally this follows the location. Upcoming shifts are re-based so their local start and end times don't move.
				</Dialog.Description>
			</Dialog.Header>
			<form
				method="POST"
				action="?/updateReferenceTimezone"
				class="space-y-4"
				use:enhance={() => {
					submitting = true;
					return async ({ update }) => {
						submitting = false;
						timezoneOpen = false;
						await update();
					};
				}}
			>
				<div class="space-y-1.5">
					<Label for="reference-timezone" class="font-semibold">Timezone</Label>
					<Select.Root
						selected={{ value: tz, label: tzLabel(tz) }}
						onSelectedChange={(v) => {
							if (v?.value) tz = String(v.value);
						}}
					>
						<Select.Trigger id="reference-timezone"><Select.Value /></Select.Trigger>
						<Select.Content>
							{#each tzOptions as option (option.name)}
								<Select.Item value={option.name}>{option.label}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
					<input type="hidden" name="referenceTimezone" value={tz} />
				</div>
				<Dialog.Footer class="gap-2">
					<Button type="button" variant="outline" on:click={() => (timezoneOpen = false)}>Cancel</Button>
					<Button type="submit" disabled={submitting || tz === timezone}>{submitting ? 'Saving…' : 'Save timezone'}</Button>
				</Dialog.Footer>
			</form>
		</Dialog.Content>
	</Dialog.Root>
{/if}
