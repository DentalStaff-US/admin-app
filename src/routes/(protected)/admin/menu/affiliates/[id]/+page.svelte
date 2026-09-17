<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	export let data;
	export let form;

	const money = (v: string | number | null | undefined) =>
		`$${Number(v ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
	const when = (d: Date | string | null | undefined) => (d ? new Date(d).toLocaleDateString() : '—');

	const statusClass = (s: string) =>
		s === 'ACTIVE'
			? 'bg-green-100 text-green-800'
			: s === 'ON_HOLD'
				? 'bg-amber-100 text-amber-800'
				: s === 'DENIED'
					? 'bg-red-100 text-red-800'
					: 'bg-gray-100 text-gray-700';

	$: p = data.profile;
	$: flagged = data.referrals.filter((r) => r.status === 'PENDING');
	$: unpaid = Number(data.totals.unpaidApproved);
</script>

<svelte:head><title>Affiliate #{p.pid} · {p.name ?? p.email} | DTSS</title></svelte:head>

<section class="grow h-screen overflow-y-auto container mx-auto px-4 py-6">
	<div class="p-6">
		<a href="/admin/menu/affiliates" class="text-sm text-blue-600 hover:underline">← All affiliates</a>
		<div class="mt-2 flex flex-wrap items-center gap-3">
			<h1 class="text-3xl font-extrabold tracking-tighter">{p.name ?? p.email}</h1>
			<span class="rounded-full px-3 py-1 text-xs font-medium {statusClass(p.status)}">{p.status}</span>
			{#if p.statusSetManually}
				<span class="text-[10px] uppercase tracking-wide text-gray-400">set manually</span>
			{/if}
		</div>
		<p class="mt-1 text-sm text-gray-600">
			Affiliate #{p.pid} · {data.affiliateType} · {p.email}
			{#if p.organizationName}· {p.organizationName}{/if}
			· joined {when(p.createdAt)}
		</p>
		{#if p.statusReason}
			<p class="mt-1 text-xs text-gray-500">Status reason: {p.statusReason}</p>
		{/if}
		{#if form?.message}
			<p class="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{form.message}</p>
		{/if}
	</div>

	<!-- Totals -->
	<div class="px-6 grid grid-cols-2 md:grid-cols-5 gap-4">
		{#each [['Referral code', p.code ?? '—', ''], ['Pending', money(data.totals.pending), 'inside the cohort hold'], [unpaid < 0 ? 'Owed back to DTSS' : 'Awaiting payout', money(Math.abs(unpaid)), unpaid < 0 ? 'nets against future commission' : 'matured, pays next run'], ['Paid out', money(data.totals.paid), ''], ['Reversed', money(data.totals.reversed), '']] as [label, value, hint]}
			<div class="rounded-lg border bg-white p-4 {label === 'Owed back to DTSS' ? 'border-amber-300 bg-amber-50' : 'border-gray-200'}">
				<p class="text-xs text-gray-500">{label}</p>
				<p class="mt-1 text-xl font-semibold">{value}</p>
				{#if hint}<p class="mt-1 text-[11px] text-gray-500">{hint}</p>{/if}
			</div>
		{/each}
	</div>

	<!-- Payouts readiness -->
	<div class="px-6 pt-6">
		<div class="rounded-lg border border-gray-200 bg-white p-4 text-sm">
			<span class="font-medium">Stripe Connect:</span>
			{#if p.connectPayoutsEnabled}
				<span class="text-green-700">Ready</span> · <code class="text-xs">{p.stripeConnectAccountId}</code>
			{:else if p.stripeConnectAccountId}
				<span class="text-amber-700">Onboarding incomplete</span> · <code class="text-xs">{p.stripeConnectAccountId}</code>
				{#if p.connectRequirementsDue?.length}
					<span class="text-gray-500">— Stripe still needs: {p.connectRequirementsDue.join(', ')}</span>
				{/if}
			{:else}
				<span class="text-gray-500">Not set up — balance accrues and pays once connected</span>
			{/if}
		</div>
	</div>

	{#if data.isSuperadmin}
		<!-- Controls: one card each, no inline-in-table forms -->
		<div class="px-6 pt-8 grid gap-4 md:grid-cols-3">
			<!-- Status -->
			<form method="POST" action="?/setStatus" class="rounded-lg border border-gray-200 bg-white p-5">
				<h3 class="font-semibold">Status</h3>
				<p class="mt-1 text-xs text-gray-500">
					ON_HOLD stops new commission but still pays what's owed. DENIED is terminal and freezes the balance.
					Either survives the nightly eligibility sync.
				</p>
				<select name="status" class="mt-3 w-full rounded border border-gray-300 px-2 py-1.5 text-sm">
					{#each ['ACTIVE', 'ON_HOLD', 'DENIED', 'PENDING'] as s}
						<option value={s} selected={s === p.status}>{s}</option>
					{/each}
				</select>
				<input name="reason" placeholder="Reason (required)" required class="mt-2 w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
				<Button type="submit" variant="outline" class="mt-3">Update status</Button>
			</form>

			<!-- Rate override -->
			<form method="POST" action="?/setRateOverride" class="rounded-lg border border-gray-200 bg-white p-5">
				<h3 class="font-semibold">Commission rate</h3>
				<p class="mt-1 text-xs text-gray-500">
					Currently <strong>{data.effectiveRate.ratePercent}%</strong>
					({data.effectiveRate.source === 'AFFILIATE_OVERRIDE' ? 'override' : `program default ${data.programRate}%`}).
					Forward-only — earned commission keeps its rate.
				</p>
				<input
					name="ratePercent"
					type="number"
					step="0.01"
					min="0"
					max="100"
					value={p.commissionRateOverride ?? ''}
					placeholder="Leave blank for program default"
					class="mt-3 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
				/>
				<input name="reason" value={p.overrideReason ?? ''} placeholder="Reason" class="mt-2 w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
				<Button type="submit" variant="outline" class="mt-3">Save rate</Button>
			</form>

			<!-- Adjustment -->
			<form method="POST" action="?/adjust" class="rounded-lg border border-gray-200 bg-white p-5">
				<h3 class="font-semibold">Manual adjustment</h3>
				<p class="mt-1 text-xs text-gray-500">
					Adds a ledger row — never edits one. Positive credits, negative debits. Nets against the next payout.
				</p>
				<input name="amount" type="number" step="0.01" placeholder="± amount, e.g. -14.50" required class="mt-3 w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
				<input name="reason" placeholder="Reason (required, shows in the ledger)" required class="mt-2 w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
				<Button type="submit" variant="outline" class="mt-3">Record adjustment</Button>
			</form>
		</div>
	{/if}

	<!-- Flagged referrals for THIS affiliate -->
	{#if flagged.length}
		<div class="px-6 pt-8">
			<h2 class="text-xl font-semibold">Flagged for review ({flagged.length})</h2>
			<div class="mt-3 overflow-x-auto rounded-lg border border-gray-200 bg-white">
				<table class="w-full text-sm">
					<thead class="text-left text-xs uppercase text-gray-500"><tr><th class="px-4 py-2">Referred</th><th>Reason</th><th></th></tr></thead>
					<tbody>
						{#each flagged as r}
							<tr class="border-t border-gray-100">
								<td class="px-4 py-2">{r.referredEmail}</td>
								<td class="text-amber-700">{r.flaggedReason}</td>
								<td class="py-2">
									{#if data.isSuperadmin}
										<div class="flex gap-2">
											<form method="POST" action="?/resolveFlagged"><input type="hidden" name="referralId" value={r.id} /><input type="hidden" name="approve" value="true" /><Button type="submit" variant="outline">Approve</Button></form>
											<form method="POST" action="?/resolveFlagged"><input type="hidden" name="referralId" value={r.id} /><input type="hidden" name="approve" value="false" /><Button type="submit" variant="outline">Reject</Button></form>
										</div>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}

	<!-- Referrals -->
	<div class="px-6 pt-8">
		<h2 class="text-xl font-semibold">Referrals ({data.referrals.length})</h2>
		<div class="mt-3 overflow-x-auto rounded-lg border border-gray-200 bg-white">
			<table class="w-full text-sm">
				<thead class="text-left text-xs uppercase text-gray-500"><tr><th class="px-4 py-2">Referred</th><th>Type</th><th>Source</th><th>Status</th><th>Joined</th></tr></thead>
				<tbody>
					{#each data.referrals as r}
						<tr class="border-t border-gray-100">
							<td class="px-4 py-2">{r.referredName ?? '—'}<div class="text-xs text-gray-500">{r.referredEmail}</div></td>
							<td>{r.referredRole === 'CANDIDATE' ? 'Professional' : r.referredRole === 'EXTERNAL_PARTNER' ? 'Partner' : 'Practice'}</td>
							<td class="text-xs">{r.attributionSource}</td>
							<td>{r.status}{#if r.rejectedReason}<div class="text-xs text-gray-500">{r.rejectedReason}</div>{/if}</td>
							<td>{when(r.signedUpAt)}</td>
						</tr>
					{:else}
						<tr><td colspan="5" class="px-4 py-4 text-gray-500">No referrals yet.</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>

	<!-- Ledger -->
	<div class="px-6 pt-8">
		<h2 class="text-xl font-semibold">Ledger</h2>
		<p class="mt-1 text-xs text-gray-500">Append-only. Adjustments and reversals appear as their own rows.</p>
		<div class="mt-3 overflow-x-auto rounded-lg border border-gray-200 bg-white">
			<table class="w-full text-sm">
				<thead class="text-left text-xs uppercase text-gray-500"><tr><th class="px-4 py-2">Date</th><th>Source</th><th>Base</th><th>Commission</th><th>Status</th><th>Cohort</th><th>Note</th></tr></thead>
				<tbody>
					{#each data.ledger as e}
						<tr class="border-t border-gray-100 {Number(e.commissionAmount) < 0 ? 'bg-amber-50' : ''}">
							<td class="px-4 py-2">{when(e.revenueAt)}</td>
							<td class="text-xs">{e.sourceType}</td>
							<td>{money(e.grossAmount)}</td>
							<td class="font-medium">{money(e.commissionAmount)}</td>
							<td>{e.status}</td>
							<td class="text-xs">{e.cohortMonth}</td>
							<td class="text-xs text-gray-500">{e.reversedReason ?? e.notes ?? ''}</td>
						</tr>
					{:else}
						<tr><td colspan="7" class="px-4 py-4 text-gray-500">No commission yet.</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>

	<!-- Payouts -->
	<div class="px-6 py-8">
		<h2 class="text-xl font-semibold">Payouts</h2>
		<div class="mt-3 overflow-x-auto rounded-lg border border-gray-200 bg-white">
			<table class="w-full text-sm">
				<thead class="text-left text-xs uppercase text-gray-500"><tr><th class="px-4 py-2">Cohort</th><th>Amount</th><th>Status</th><th>Transfer</th><th>Paid</th></tr></thead>
				<tbody>
					{#each data.payouts as po}
						<tr class="border-t border-gray-100">
							<td class="px-4 py-2">{po.cohortMonth}</td>
							<td class="font-medium">{money(po.amount)}</td>
							<td>{po.status}{#if po.failureReason}<div class="text-xs text-red-600">{po.failureReason}</div>{/if}</td>
							<td class="text-xs text-gray-500">{po.stripeTransferId ?? '—'}</td>
							<td>{when(po.paidAt)}</td>
						</tr>
					{:else}
						<tr><td colspan="5" class="px-4 py-4 text-gray-500">No payouts yet.</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
</section>
