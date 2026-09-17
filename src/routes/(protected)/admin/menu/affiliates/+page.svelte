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
	// A negative approved balance means clawbacks (reversals of already-paid
	// commission) exceed unpaid earnings — the affiliate owes DTSS, and it nets
	// against their next commission. Label it as such rather than showing "-$x
	// awaiting payout", which reads like a bug.
	$: approvedIsNegative = Number(data.totals.approved) < 0;

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
		{#each [['Affiliates', data.totals.affiliates, ''], ['Qualified referrals', data.totals.qualifiedReferrals, ''], ['Pending commission', money(data.totals.pending), 'Earned; still inside the cohort hold'], [approvedIsNegative ? 'Net owed back to DTSS' : 'Approved (awaiting payout)', money(Math.abs(Number(data.totals.approved))), approvedIsNegative ? 'Clawbacks exceed unpaid earnings. Nets against future commission before anything is transferred.' : 'Matured; pays on the next run'], ['Paid out', money(data.totals.paid), ''], ['Reversed', money(data.totals.reversed), 'Voided/refunded before payout'], ['Flagged for review', data.totals.flaggedReferrals, ''], ['Failed payouts', failedPayouts.length, '']] as [label, value, hint]}
			<div class="rounded-lg border border-gray-200 bg-white p-4 {approvedIsNegative && label === 'Net owed back to DTSS' ? 'border-amber-300 bg-amber-50' : ''}">
				<p class="text-xs text-gray-500">{label}</p>
				<p class="mt-1 text-2xl font-semibold">{value}</p>
				{#if hint}<p class="mt-1 text-[11px] leading-snug text-gray-500">{hint}</p>{/if}
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

		<!-- Plain GET form: filters live in the URL, so a filtered view is
		     bookmarkable and survives a refresh. -->
		<form method="GET" class="mt-3 flex flex-wrap items-end gap-2" data-sveltekit-keepfocus>
			<div class="min-w-[16rem] flex-1">
				<label class="block text-xs font-medium text-gray-500" for="q">Search</label>
				<input
					id="q"
					name="q"
					value={data.filters.q}
					placeholder="Name, email, organization, code, or #id"
					class="mt-1 w-full rounded border border-gray-300 px-3 py-1.5 text-sm"
				/>
			</div>
			<div>
				<label class="block text-xs font-medium text-gray-500" for="status">Status</label>
				<select id="status" name="status" class="mt-1 rounded border border-gray-300 px-2 py-1.5 text-sm">
					<option value="">Any</option>
					{#each ['ACTIVE', 'ON_HOLD', 'PENDING', 'DENIED'] as s}
						<option value={s} selected={data.filters.status === s}>{s}</option>
					{/each}
				</select>
			</div>
			<div>
				<label class="block text-xs font-medium text-gray-500" for="role">Type</label>
				<select id="role" name="role" class="mt-1 rounded border border-gray-300 px-2 py-1.5 text-sm">
					<option value="">Any</option>
					<option value="CLIENT" selected={data.filters.role === 'CLIENT'}>Practice</option>
					<option value="CLIENT_STAFF" selected={data.filters.role === 'CLIENT_STAFF'}>Practice staff</option>
					<option value="CANDIDATE" selected={data.filters.role === 'CANDIDATE'}>Professional</option>
					<option value="EXTERNAL_PARTNER" selected={data.filters.role === 'EXTERNAL_PARTNER'}>External partner</option>
				</select>
			</div>
			<Button type="submit" variant="outline">Filter</Button>
			{#if data.filters.q || data.filters.status || data.filters.role}
				<a href="/admin/menu/affiliates" class="text-sm text-gray-500 underline">clear</a>
			{/if}
		</form>
		<p class="mt-2 text-xs text-gray-500">
			{data.affiliates.length} affiliate{data.affiliates.length === 1 ? '' : 's'}{data.filters.q || data.filters.status || data.filters.role ? ' matching' : ''}
		</p>

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
								<a href="/admin/menu/affiliates/{a.id}" class="hover:underline">{a.name ?? '—'}</a>
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
								<a href="/admin/menu/affiliates/{a.id}" class="text-sm text-blue-600 hover:underline">
									Manage →
								</a>
							</td>
						</tr>
					{:else}
						<tr><td colspan="8" class="py-4 text-gray-500">{data.filters.q || data.filters.status || data.filters.role ? 'No affiliates match those filters.' : 'No affiliates yet.'}</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>

	<!-- Exports live in Records Management → Exports, with the rest of the
	     financial downloads. -->
	{#if data.isSuperadmin}
		<div class="px-6 pt-8">
			<a href="/admin/menu/exports" class="text-sm text-blue-600 underline">
				Download ledger / payouts CSV → Exports
			</a>
		</div>
	{/if}

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
