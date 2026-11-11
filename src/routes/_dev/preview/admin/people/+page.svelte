<script lang="ts">
	import { page } from '$app/state';
	import AdminShell from '$shell/AdminShell.svelte';
	import Notice from '$dtss/Notice.svelte';
	import Page from '$dtss/Page.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';
	import ImpersonateButton from '$lib/components/admin/ImpersonateButton.svelte';
	import AffiliateSettingsCard from '$lib/components/affiliate/AffiliateSettingsCard.svelte';
	import {
		AdminProfile,
		AdminsTable,
		AffiliateControls,
		AffiliateLedgerTable,
		AffiliatePayoutsTable,
		AffiliateProgramSettingsForm,
		AffiliateReferralsTable,
		AffiliatesTable,
		AffiliateTotals,
		FlaggedReferralsTable,
		InviteAdminDialog,
		UserImportPage,
		UsersTable,
		parseImportRow,
		type UserRow
	} from '$features/admin';

	// Dev-only fixtures for the admin People screens. ?view=users|admins|affiliates|affiliate|profile|import
	const view = $derived(page.url.searchParams.get('view') ?? 'users');
	let sidebar = $state<'expanded' | 'rail'>('expanded');

	const fakeForm = (data: Record<string, unknown>) => ({ id: Math.random().toString(36), valid: true, posted: false, errors: {}, data, constraints: {} });

	const day = (n: number) => new Date(Date.now() - n * 864e5);
	const users: UserRow[] = [
		{ id: 'u1', firstName: 'Dana', lastName: 'Whitfield', email: 'dana.whitfield@example.com', role: 'CANDIDATE', verified: true, completedOnboarding: true, banned: false, banReason: null, banExpires: null, createdAt: day(3), companyName: null, city: 'Tampa', state: 'FL', fullAddress: '12 Bay St, Tampa, FL', candidateProfileId: 'cp1', clientProfileId: null },
		{ id: 'u2', firstName: 'Marcus', lastName: 'Lee', email: 'marcus@brightsmiles.example', role: 'CLIENT', verified: true, completedOnboarding: true, banned: false, banReason: null, banExpires: null, createdAt: day(40), companyName: 'Bright Smiles Dental', city: 'Brandon', state: 'FL', fullAddress: null, candidateProfileId: null, clientProfileId: 'cl1' },
		{ id: 'u3', firstName: 'Priya', lastName: 'Shah', email: 'priya.shah@example.com', role: 'CANDIDATE', verified: false, completedOnboarding: false, banned: true, banReason: 'No-show on three shifts', banExpires: null, createdAt: day(90), companyName: null, city: 'Orlando', state: 'FL', fullAddress: null, candidateProfileId: 'cp2', clientProfileId: null },
		{ id: 'me', firstName: 'Shannon', lastName: 'Carter', email: 'shannon@example.com', role: 'SUPERADMIN', verified: true, completedOnboarding: true, banned: false, banReason: null, banExpires: null, createdAt: day(400), companyName: null, city: null, state: null, fullAddress: null, candidateProfileId: null, clientProfileId: null },
		{ id: 'u5', firstName: 'Jo', lastName: 'Okafor', email: 'jo@harbordental.example', role: 'CLIENT_STAFF', verified: true, completedOnboarding: false, banned: false, banReason: null, banExpires: null, createdAt: day(12), companyName: 'Harbor Dental Group', city: 'Clearwater', state: 'FL', fullAddress: null, candidateProfileId: null, clientProfileId: 'cl2' }
	];
	const admins = [
		{ id: 'me', firstName: 'Shannon', lastName: 'Carter', email: 'shannon@example.com', role: 'SUPERADMIN' },
		{ id: 'a2', firstName: 'Luis', lastName: 'Ortega', email: 'luis@example.com', role: 'SUPERADMIN' }
	];
	const totals = { affiliates: 42, qualifiedReferrals: 117, pending: '1240.50', approved: '-86.25', paid: '18450.00', reversed: '312.40', flaggedReferrals: 2 };
	const affiliates = [
		{ id: 'af1', pid: 1001, name: 'Dana Whitfield', email: 'dana.whitfield@example.com', role: 'CANDIDATE', code: 'DANA25', status: 'ACTIVE', statusSetManually: false, statusReason: null, commissionRateOverride: null, connectPayoutsEnabled: true, stripeConnectAccountId: 'acct_1Nf3' },
		{ id: 'af2', pid: 1002, name: 'Bright Smiles Dental', email: 'marcus@brightsmiles.example', role: 'CLIENT', code: 'BRIGHT', status: 'ON_HOLD', statusSetManually: true, statusReason: 'Reviewing referral pattern', commissionRateOverride: '7.50', connectPayoutsEnabled: false, stripeConnectAccountId: 'acct_9Zq1' },
		{ id: 'af3', pid: 1003, name: null, email: 'partner@example.com', role: 'EXTERNAL_PARTNER', code: null, status: 'PENDING', statusSetManually: false, statusReason: null, commissionRateOverride: null, connectPayoutsEnabled: false, stripeConnectAccountId: null }
	];
	const flagged = [
		{ id: 'r1', referredEmail: 'new.hygienist@example.com', affiliatePid: 1002, flaggedReason: 'Same device fingerprint as the affiliate', status: 'PENDING' },
		{ id: 'r2', referredEmail: 'office@sunrise.example', affiliatePid: 1001, flaggedReason: '5 sign-ups from one IP in an hour', status: 'PENDING' }
	];
	const payouts = [
		{ id: 'p1', cohortMonth: '2026-09', email: 'dana.whitfield@example.com', amount: '412.80', status: 'PAID', failureReason: null, stripeTransferId: 'tr_1PxA9', paidAt: day(9) },
		{ id: 'p2', cohortMonth: '2026-09', email: 'marcus@brightsmiles.example', amount: '96.00', status: 'FAILED', failureReason: 'Connect account not ready', stripeTransferId: null, paidAt: null },
		{ id: 'p3', cohortMonth: '2026-10', email: 'dana.whitfield@example.com', amount: '388.10', status: 'PENDING', failureReason: null, stripeTransferId: null, paidAt: null }
	];
	const referrals = [
		{ id: 'r3', referredName: 'Sunrise Dental', referredEmail: 'office@sunrise.example', referredRole: 'CLIENT', attributionSource: 'LINK', status: 'QUALIFIED', rejectedReason: null, signedUpAt: day(60) },
		{ id: 'r4', referredName: 'Alex Kim', referredEmail: 'alex.kim@example.com', referredRole: 'CANDIDATE', attributionSource: 'MANUAL', status: 'REJECTED', rejectedReason: 'Self-referral', signedUpAt: day(20) },
		{ id: 'r1', referredName: null, referredEmail: 'new.hygienist@example.com', referredRole: 'CANDIDATE', attributionSource: 'COOKIE', status: 'PENDING', rejectedReason: null, signedUpAt: day(2) }
	];
	const ledger = [
		{ id: 'l1', revenueAt: day(70), sourceType: 'INVOICE', grossAmount: '2400.00', commissionAmount: '120.00', status: 'PAID', cohortMonth: '2026-08', reversedReason: null, notes: null },
		{ id: 'l2', revenueAt: day(30), sourceType: 'REFUND', grossAmount: '-640.00', commissionAmount: '-32.00', status: 'REVERSED', cohortMonth: '2026-10', reversedReason: 'Invoice refunded', notes: null },
		{ id: 'l3', revenueAt: day(5), sourceType: 'ADJUSTMENT', grossAmount: '0', commissionAmount: '25.00', status: 'PENDING', cohortMonth: '2026-11', reversedReason: null, notes: 'Goodwill credit' }
	];
	const importUsers = [
		parseImportRow({ 'First Name': 'Dana', 'Last Name': 'Whitfield', Email: 'dana@example.com', 'Address (Street 1)': '12 Bay St', City: 'Tampa', State: 'FL', Zip: '33601', Discipline: 'Dental Hygienist' }, 'CANDIDATE'),
		parseImportRow({ 'First Name': 'Alex', 'Last Name': '', Email: 'alex@', City: 'Orlando', State: 'FL' }, 'CANDIDATE'),
		parseImportRow({ 'First Name': 'Sam', 'Last Name': 'Rivera', Email: 'sam.rivera@example.com', Discipline: 'Dental Assistant' }, 'CANDIDATE')
	];
</script>

<AdminShell pathname="/admin/menu" nav={{ role: 'SUPERADMIN' }} bind:sidebar name="Shannon Carter" initials="SC">
	{#if view === 'users'}
		<Page>
			<PageHeader title="All users" description="Search, inspect, suspend and remove users across every role." />
			<UsersTable {users} total={134} page={2} limit={25} search="" currentUserId="me" pageHref={(p) => `?view=users&page=${p}`} />
			<UsersTable users={[]} total={0} page={1} limit={25} search="tampa" currentUserId="me" pageHref={(p) => `?page=${p}`} />
			<div class="flex flex-wrap gap-3">
				<ImpersonateButton userId="u2" userName="Marcus Lee (account owner)" label="Sign in as owner" />
				<ImpersonateButton userId="u1" userName="Dana Whitfield" crossApp />
				<ImpersonateButton userId="u5" userName="Jo Okafor (staff)" variant="ghost" iconOnly />
			</div>
		</Page>
	{:else if view === 'admins'}
		<Page>
			<PageHeader title="Admins" description="The people who run DTSS. Open one to edit their details.">
				{#snippet actions()}<InviteAdminDialog form={fakeForm({ email: '' })} />{/snippet}
			</PageHeader>
			<AdminsTable {admins} />
		</Page>
	{:else if view === 'profile'}
		<AdminProfile
			profile={{ id: 'a2', firstName: 'Luis', lastName: 'Ortega', email: 'luis@example.com', role: 'SUPERADMIN' }}
			isSelf={false}
			updateForm={fakeForm({ firstName: 'Luis', lastName: 'Ortega', email: 'luis@example.com' })}
		/>
	{:else if view === 'affiliates'}
		<Page>
			<PageHeader title="Affiliate program" description="Commission is 5.00% of regular hours on paid temp-shift invoices. Overtime is excluded. Payouts settle on the 1st of the month after next." />
			<Notice tone="pending" title="The program is off">The portal is dark and the affiliate API returns 503, but referral link capture is still running.</Notice>
			<AffiliateTotals {totals} failedPayouts={1} />
			<AffiliateProgramSettingsForm form={fakeForm({ commissionRate: 5, payoutMinimum: 50, programEnabled: false })} canEdit />
			<h2 class="text-h2">Flagged for review (2)</h2>
			<FlaggedReferralsTable referrals={flagged} canResolve />
			<h2 class="text-h2">Affiliates</h2>
			<AffiliatesTable {affiliates} filters={{ q: '', status: 'ON_HOLD', role: '' }} programRate="5.00" />
			<h2 class="text-h2">Payout history</h2>
			<AffiliatePayoutsTable {payouts} />
			<AffiliateSettingsCard status={{ programEnabled: true, eligible: true, enrolled: true, status: 'ACTIVE', connectComplete: false, referralUrl: 'https://dtss.example/r/DANA25' } as any} portalUrl="#" />
		</Page>
	{:else if view === 'affiliate'}
		<Page>
			<PageHeader title="Bright Smiles Dental" description="Affiliate no. 1002 · Practice · marcus@brightsmiles.example · joined 9/1/2026" />
			<AffiliateControls name="Bright Smiles Dental" status="ON_HOLD" commissionRateOverride="7.50" overrideReason="Launch partner" effectiveRate={{ ratePercent: '7.50', source: 'AFFILIATE_OVERRIDE' }} programRate="5.00" />
			<h2 class="text-h2">Referrals (3)</h2>
			<AffiliateReferralsTable {referrals} />
			<h2 class="text-h2">Ledger</h2>
			<AffiliateLedgerTable {ledger} />
			<AffiliateLedgerTable ledger={[]} />
			<h2 class="text-h2">Payouts</h2>
			<AffiliatePayoutsTable payouts={payouts.slice(0, 2)} perAffiliate />
		</Page>
	{:else if view === 'import'}
		<UserImportPage
			isSuperadmin
			poll={false}
			initialRole="CANDIDATE"
			initialUsers={importUsers}
			initialResult={{ success: 48, skipped: 3, errors: ['jo@example.com already exists'], geocodingQueued: 45 }}
		/>
	{/if}
</AdminShell>
