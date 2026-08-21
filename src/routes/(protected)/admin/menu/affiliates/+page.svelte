<script lang="ts">
	import { superForm } from 'sveltekit-superforms/client';
	import { Button } from '$lib/components/ui/button';
	import { affiliateTypeForRole } from '$lib/config/constants';

	export let data;

	const { form, errors, enhance, submitting } = superForm(data.settingsForm);

	const money = (v: string | number | null | undefined) =>
		`$${Number(v ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

	const statusClass = (s: string) =>
		s === 'ACTIVE'
			? 'bg-green-100 text-green-800'
			: s === 'ON_HOLD'
				? 'bg-amber-100 text-amber-800'
				: s === 'DENIED'
					? 'bg-red-100 text-red-800'
					: 'bg-gray-100 text-gray-700';

	$: flagged = data.referrals.filter((r) => r.status === 'PENDING');
	$: failedPayouts = data.payouts.filter((p) => p.status === 'FAILED');
</script>

<section class="grow h-screen overflow-y-auto container mx-auto px-4 py-6">
	<div class="p-6 flex flex-col gap-2">
		<h1 class="text-3xl font-extrabold tracking-tighter md:text-4xl">Affiliate Program</h1>
		<p class="text-sm text-gray-600">
			Commission is <strong>{data.config.commissionRate}% of regular hours</strong> on paid temp-shift
			invoices. Overtime is excluded. Payouts settle on the 1st of the month after next.
		</p>
		{#if !data.config.programEnabled}
			<p class="mt-2 rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
				The program is <strong>off</strong>. The portal is dark and the affiliate API returns 503 —
				but referral link capture is still running, so attribution keeps accumulating.
			</p>
		{/if}
	</div>

	<!-- Totals -->
	<div class="px-6 grid grid-cols-2 md:grid-cols-4 gap-4">
		{#each [['Affiliates', data.totals.affiliates], ['Qualified referrals', data.totals.qualifiedReferrals], ['Pending commission', money(data.totals.pending)], ['Approved (awaiting payout)', money(data.totals.approved)], ['Paid out', money(data.totals.paid)], ['Reversed', money(data.totals.reversed)], ['Flagged for review', data.totals.flaggedReferrals], ['Failed payouts', failedPayouts.length]] as [label, value]}
			<div class="rounded-lg border border-gray-200 bg-white p-4">
				<p class="text-xs text-gray-500">{label}</p>
				<p class="mt-1 text-2xl font-semibold">{value}</p>
			</div>
		{/each}
	</div>

	<!-- Program settings -->
	<div class="px-6 pt-8">
		<h2 class="text-xl font-semibold">Program settings</h2>
		<p class="mt-1 text-sm text-gray-600">
			Rate changes are <strong>forward-only</strong> — commission already earned keeps the rate it was
			calculated with. This is separate from the platform fee charged to practices.
		</p>

		<form method="POST" action="?/updateSettings" use:enhance class="mt-4 max-w-xl space-y-4">
			<div>
				<label class="block text-sm font-medium" for="commissionRate">Commission rate (%)</label>
				<input
					id="commissionRate"
					name="commissionRate"
					type="number"
					step="0.01"
					min="0"
					max="100"
					bind:value={$form.commissionRate}
					class="mt-1 w-40 rounded border border-gray-300 px-3 py-2"
					disabled={!data.isSuperadmin}
				/>
				{#if $errors.commissionRate}
					<p class="mt-1 text-sm text-red-600">{$errors.commissionRate}</p>
				{/if}
			</div>

			<div>
				<label class="block text-sm font-medium" for="payoutMinimum">Payout minimum ($)</label>
				<input
					id="payoutMinimum"
					name="payoutMinimum"
					type="number"
					step="0.01"
					min="0"
					bind:value={$form.payoutMinimum}
					class="mt-1 w-40 rounded border border-gray-300 px-3 py-2"
					disabled={!data.isSuperadmin}
				/>
				<p class="mt-1 text-xs text-gray-500">Balances below this roll forward to the next run.</p>
			</div>

			<label class="flex items-center gap-2 text-sm">
				<input
					name="programEnabled"
					type="checkbox"
					bind:checked={$form.programEnabled}
					disabled={!data.isSuperadmin}
				/>
				Program enabled
			</label>

			{#if data.isSuperadmin}
				<Button type="submit" disabled={$submitting}>Save settings</Button>
			{:else}
				<p class="text-sm text-gray-500">Superadmin only.</p>
			{/if}
		</form>
	</div>

	<!-- Flagged referrals -->
	{#if flagged.length}
		<div class="px-6 pt-8">
			<h2 class="text-xl font-semibold">Flagged for review ({flagged.length})</h2>
			<p class="mt-1 text-sm text-gray-600">
				Caught by a fraud heuristic. Automated checks only hard-reject on identity equality —
				anything statistical comes here for a human.
			</p>
			<div class="mt-3 overflow-x-auto">
				<table class="w-full text-sm">
					<thead class="text-left text-xs uppercase text-gray-500">
						<tr>
							<th class="py-2">Referred</th>
							<th>Affiliate</th>
							<th>Reason</th>
							<th></th>
						</tr>
					</thead>
					<tbody>
						{#each flagged as r}
							<tr class="border-t border-gray-100">
								<td class="py-2">{r.referredEmail}</td>
								<td>#{r.affiliatePid}</td>
								<td class="text-amber-700">{r.flaggedReason}</td>
								<td class="py-2">
									<div class="flex gap-2">
										<form method="POST" action="?/resolveFlagged">
											<input type="hidden" name="referralId" value={r.id} />
											<input type="hidden" name="approve" value="true" />
											<Button type="submit" variant="outline">Approve</Button>
										</form>
										<form method="POST" action="?/resolveFlagged">
											<input type="hidden" name="referralId" value={r.id} />
											<input type="hidden" name="approve" value="false" />
											<Button type="submit" variant="outline">Reject</Button>
										</form>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}

	<!-- Affiliates -->
	<div class="px-6 pt-8">
		<h2 class="text-xl font-semibold">Affiliates</h2>
		<div class="mt-3 overflow-x-auto">
			<table class="w-full text-sm">
				<thead class="text-left text-xs uppercase text-gray-500">
					<tr>
						<th class="py-2">#</th>
						<th>Name</th>
						<th>Type</th>
						<th>Code</th>
						<th>Status</th>
						<th>Rate</th>
						<th>Payouts</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each data.affiliates as a}
						<tr class="border-t border-gray-100 align-top">
							<td class="py-2">{a.pid}</td>
							<td>
								<div>{a.name ?? '—'}</div>
								<div class="text-xs text-gray-500">{a.email}</div>
							</td>
							<td>{affiliateTypeForRole(a.role)}</td>
							<td><code class="text-xs">{a.code ?? '—'}</code></td>
							<td>
								<span class="rounded-full px-2 py-1 text-xs font-medium {statusClass(a.status)}">
									{a.status}
								</span>
								{#if a.statusSetManually}
									<div class="mt-1 text-[10px] uppercase text-gray-400">manual</div>
								{/if}
								{#if a.statusReason}
									<div class="mt-1 text-xs text-gray-500">{a.statusReason}</div>
								{/if}
							</td>
							<td>
								{#if a.commissionRateOverride}
									<span class="font-medium">{a.commissionRateOverride}%</span>
									<div class="text-xs text-gray-500">override</div>
								{:else}
									<span class="text-gray-500">{data.config.commissionRate}%</span>
								{/if}
							</td>
							<td>
								{#if a.connectPayoutsEnabled}
									<span class="text-green-700">Ready</span>
								{:else if a.stripeConnectAccountId}
									<span class="text-amber-700">Onboarding</span>
								{:else}
									<span class="text-gray-500">Not set up</span>
								{/if}
							</td>
							<td class="py-2">
								{#if data.isSuperadmin}
									<div class="flex flex-col gap-2">
										<form method="POST" action="?/setRateOverride" class="flex gap-1">
											<input type="hidden" name="affiliateId" value={a.id} />
											<input
												name="ratePercent"
												type="number"
												step="0.01"
												min="0"
												max="100"
												placeholder="rate"
												value={a.commissionRateOverride ?? ''}
												class="w-20 rounded border border-gray-300 px-2 py-1 text-xs"
											/>
											<Button type="submit" variant="outline">Set</Button>
										</form>
										<form method="POST" action="?/setStatus" class="flex gap-1">
											<input type="hidden" name="affiliateId" value={a.id} />
											<select name="status" class="rounded border border-gray-300 px-2 py-1 text-xs">
												<option value="ACTIVE">ACTIVE</option>
												<option value="ON_HOLD">ON_HOLD</option>
												<option value="DENIED">DENIED</option>
												<option value="PENDING">PENDING</option>
											</select>
											<input
												name="reason"
												placeholder="reason"
												required
												class="w-28 rounded border border-gray-300 px-2 py-1 text-xs"
											/>
											<Button type="submit" variant="outline">Apply</Button>
										</form>
									</div>
								{/if}
							</td>
						</tr>
					{:else}
						<tr><td colspan="8" class="py-4 text-gray-500">No affiliates yet.</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>

	<!-- Payout history -->
	<div class="px-6 py-8">
		<h2 class="text-xl font-semibold">Payout history</h2>
		<div class="mt-3 overflow-x-auto">
			<table class="w-full text-sm">
				<thead class="text-left text-xs uppercase text-gray-500">
					<tr>
						<th class="py-2">Cohort</th>
						<th>Affiliate</th>
						<th>Amount</th>
						<th>Status</th>
						<th>Reference</th>
					</tr>
				</thead>
				<tbody>
					{#each data.payouts as p}
						<tr class="border-t border-gray-100">
							<td class="py-2">{p.cohortMonth}</td>
							<td>{p.email}</td>
							<td>{money(p.amount)}</td>
							<td>
								<span
									class="rounded-full px-2 py-1 text-xs font-medium
									{p.status === 'PAID'
										? 'bg-green-100 text-green-800'
										: p.status === 'FAILED'
											? 'bg-red-100 text-red-800'
											: 'bg-gray-100 text-gray-700'}"
								>
									{p.status}
								</span>
								{#if p.failureReason}
									<div class="mt-1 text-xs text-red-600">{p.failureReason}</div>
								{/if}
							</td>
							<td class="text-xs text-gray-500">{p.stripeTransferId ?? '—'}</td>
						</tr>
					{:else}
						<tr><td colspan="5" class="py-4 text-gray-500">No payouts yet.</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
</section>
