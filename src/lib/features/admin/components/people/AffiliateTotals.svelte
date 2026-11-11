<script lang="ts">
	import { AlertTriangle, BadgeCheck, Banknote, Clock, Flag, Hourglass, Undo2, Users } from 'lucide-svelte';
	import StatTile from '$dtss/StatTile.svelte';
	import { money } from './people';

	type Totals = {
		affiliates: number;
		qualifiedReferrals: number;
		pending: string | number;
		approved: string | number;
		paid: string | number;
		reversed: string | number;
		flaggedReferrals: number;
	};

	let { totals, failedPayouts }: { totals: Totals; failedPayouts: number } = $props();

	// A negative approved balance means clawbacks exceed unpaid earnings: the
	// affiliates owe DTSS and it nets against their next commission. Say so,
	// rather than "-$x awaiting payout", which reads like a bug.
	const approvedIsNegative = $derived(Number(totals.approved) < 0);
</script>

<div class="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
	<StatTile label="Affiliates" value={totals.affiliates} icon={Users} />
	<StatTile label="Qualified referrals" value={totals.qualifiedReferrals} icon={BadgeCheck} />
	<StatTile label="Pending commission" value={money(totals.pending)} icon={Hourglass} hint="Earned, but still inside the cohort hold." />
	<StatTile
		label={approvedIsNegative ? 'Net owed back to DTSS' : 'Approved, awaiting payout'}
		value={money(Math.abs(Number(totals.approved)))}
		icon={approvedIsNegative ? AlertTriangle : Clock}
		tone={approvedIsNegative ? 'warning' : undefined}
		hint={approvedIsNegative
			? 'Clawbacks exceed unpaid earnings. Nets against future commission before anything is transferred.'
			: 'Matured commission; pays on the next run.'}
	/>
	<StatTile label="Paid out" value={money(totals.paid)} icon={Banknote} />
	<StatTile label="Reversed" value={money(totals.reversed)} icon={Undo2} hint="Voided or refunded before payout." />
	<StatTile label="Flagged for review" value={totals.flaggedReferrals} icon={Flag} tone={totals.flaggedReferrals > 0 ? 'pending' : undefined} />
	<StatTile label="Failed payouts" value={failedPayouts} icon={AlertTriangle} tone={failedPayouts > 0 ? 'negative' : undefined} />
</div>
