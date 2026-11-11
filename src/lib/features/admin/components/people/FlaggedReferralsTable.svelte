<script lang="ts">
	import { Check, X } from 'lucide-svelte';
	import ConfirmDialog from '$dtss/ConfirmDialog.svelte';
	import DataTable from '$dtss/DataTable.svelte';
	import type { DataColumn } from '$dtss/tableState';
	import { Button } from '$lib/components/ui/button';

	export type FlaggedReferral = {
		id: string;
		referredEmail: string | null;
		affiliatePid?: number | string | null;
		flaggedReason: string | null;
	};

	let {
		referrals,
		canResolve,
		showAffiliate = true
	}: { referrals: FlaggedReferral[]; canResolve: boolean; showAffiliate?: boolean } = $props();

	let target = $state<{ referral: FlaggedReferral; approve: boolean } | null>(null);
	let open = $state(false);

	function ask(referral: FlaggedReferral, approve: boolean) {
		target = { referral, approve };
		open = true;
	}

	const columns = $derived<DataColumn<FlaggedReferral>[]>([
		{ id: 'referred', header: 'Referred', value: (r) => r.referredEmail ?? '—' },
		...(showAffiliate ? [{ id: 'affiliate', header: 'Affiliate', value: (r: FlaggedReferral) => `#${r.affiliatePid ?? '—'}` }] : []),
		{ id: 'reason', header: 'Why it was flagged', cell: reasonCell },
		...(canResolve ? [{ id: 'actions', header: 'Actions', srOnlyHeader: true, cell: actionsCell, class: 'text-right' }] : [])
	]);
</script>

{#snippet reasonCell(r: FlaggedReferral)}<span class="text-status-warning-fg">{r.flaggedReason ?? '—'}</span>{/snippet}
{#snippet actionsCell(r: FlaggedReferral)}
	<div class="flex gap-2 md:justify-end">
		<Button size="sm" variant="outline" on:click={() => ask(r, true)}><Check class="mr-1 size-4" aria-hidden="true" />Approve</Button>
		<Button size="sm" variant="destructiveOutline" on:click={() => ask(r, false)}><X class="mr-1 size-4" aria-hidden="true" />Reject</Button>
	</div>
{/snippet}

{#snippet mobile(r: FlaggedReferral)}
	<p class="font-semibold">{r.referredEmail ?? '—'}{#if showAffiliate}<span class="font-normal text-muted-foreground"> · affiliate #{r.affiliatePid ?? '—'}</span>{/if}</p>
	<p class="text-sm">{@render reasonCell(r)}</p>
	{#if canResolve}<div class="mt-2">{@render actionsCell(r)}</div>{/if}
{/snippet}

<DataTable rows={referrals} {columns} key={(r) => r.id} caption="Referrals flagged for review" {mobile} />

<ConfirmDialog
	bind:open
	title={target?.approve ? `Approve the referral of ${target?.referral.referredEmail ?? 'this user'}?` : `Reject the referral of ${target?.referral.referredEmail ?? 'this user'}?`}
	description={target?.approve
		? 'The referral counts for the affiliate and starts earning commission when the referred account works through DTSS.'
		: 'The referral is rejected and the affiliate earns no commission from this account.'}
>
	{#snippet confirm()}
		<form method="POST" action="?/resolveFlagged">
			<input type="hidden" name="referralId" value={target?.referral.id ?? ''} />
			<input type="hidden" name="approve" value={target?.approve ? 'true' : 'false'} />
			<Button type="submit" variant={target?.approve ? 'default' : 'destructive'} class="min-h-11 w-full sm:min-h-10 sm:w-auto">
				{target?.approve ? 'Approve referral' : 'Reject referral'}
			</Button>
		</form>
	{/snippet}
</ConfirmDialog>
