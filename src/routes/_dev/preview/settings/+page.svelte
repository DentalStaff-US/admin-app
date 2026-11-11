<script lang="ts">
	import { page } from '$app/state';
	import AdminShell from '$shell/AdminShell.svelte';
	import FocusShell from '$shell/FocusShell.svelte';
	import {
		BillingStep,
		CompanyStepForm,
		LocationStepForm,
		OnboardingComplete,
		OnboardingFrame,
		StaffStepForm
	} from '$features/onboarding';
	import { SupportListPage, TicketDetailPage } from '$features/support';
	import {
		AdminSettingsPage,
		ClientSettingsPage,
		ClientStaffSettingsPage,
		NOTIFICATIONS_SECTION_ID,
		NotificationsSection,
		settingsSections,
		settingsViewFor,
		SettingsShell
	} from '$features/settings';
	import * as fx from './fixtures';

	// Screens: ?screen=settings (default) | onboarding | support
	//   onboarding: &step=company|location|staff|billing|complete&canceled=1&pending=1
	//   support: &view=list|ticket&admin=1&closed=1&empty=1
	// /_dev/preview/settings?role=CLIENT|CLIENT_STAFF|SUPERADMIN&admin=1&section=PROFILE|COMPANY|STAFF|BILLING|DOCUMENTS|PASSWORD|NOTIFICATIONS|AFFILIATE&list=1&billing=setup|card&empty=1
	const q = page.url.searchParams;
	const role = q.get('role') ?? 'CLIENT';
	const view = settingsViewFor(role, role === 'CLIENT' || !!q.get('admin')) ?? 'admin';
	const sections = settingsSections(view, { affiliate: view !== 'admin' });
	const group = view === 'admin' ? 'ADMIN' : view === 'client' ? 'CLIENT' : 'CLIENT_STAFF';
	const tab = q.get('section') ?? 'PROFILE';
	const initial =
		tab === 'NOTIFICATIONS'
			? NOTIFICATIONS_SECTION_ID
			: (sections.find((s) => s.href === `/settings?tab=${tab}&role=${group}`)?.id ?? sections[0].id);

	let activeId = $state(initial);
	let explicit = $state(!q.get('list'));
	const f = fx.forms();
	const empty = !!q.get('empty');
	const handleAvatarUpdated = async () => {};
	let sidebar = $state<'expanded' | 'rail'>('expanded');

	const screen = q.get('screen') ?? 'settings';
	const step = (q.get('step') ?? 'company') as 'company' | 'location' | 'staff' | 'billing' | 'complete';
	const of = fx.onboardingForms();
	const supportAdmin = !!q.get('admin');
	const supportPage = Number(q.get('page') ?? 1);
</script>

{#if screen === 'onboarding'}
	<FocusShell>
		{#if step === 'complete'}
			<OnboardingComplete firstName="Shannon" companyName="Bright Smiles Dental" billingSetUp={!q.get('nobilling')} />
		{:else if step === 'company'}
			<OnboardingFrame step="company" title="Tell us about your practice" description="Let's get your practice set up on DTSS.">
				<CompanyStepForm form={of.company} />
			</OnboardingFrame>
		{:else if step === 'location'}
			<OnboardingFrame step="location" title="Add your main location" description="Where professionals will work. If you have more than one office, add the others later.">
				<LocationStepForm form={of.location} />
			</OnboardingFrame>
		{:else if step === 'staff'}
			<OnboardingFrame step="staff" title="Invite your team" description="Give office managers and staff their own sign-in. You can skip this and invite people later.">
				<StaffStepForm form={of.staff} />
			</OnboardingFrame>
		{:else}
			<OnboardingFrame step="billing" title="Set up billing" description="One last step. Choose how you'd like to pay for shifts; you can skip it for now.">
				<BillingStep subscriptionPending={!!q.get('pending')} canceled={!!q.get('canceled')} nextHref="#" />
			</OnboardingFrame>
		{/if}
	</FocusShell>
{:else if screen === 'support'}
	<AdminShell pathname="/support" nav={{ role: supportAdmin ? 'SUPERADMIN' : 'CLIENT', isOfficeAdmin: !supportAdmin }} bind:sidebar name="Shannon Carter" initials="SC">
		{#if q.get('view') === 'ticket'}
			<TicketDetailPage ticket={fx.ticket(!!q.get('closed'))} viewerId="u1" isAdmin={supportAdmin} commentForm={fx.fakeForm({ body: '' })} />
		{:else}
			<SupportListPage
				tickets={empty ? [] : fx.tickets}
				form={fx.fakeForm({ title: '', expectedResults: '', actualResults: '', stepsToReproduce: '' })}
				isAdmin={supportAdmin}
				page={supportPage}
				pageSize={q.get('paged') ? 2 : 20}
				pageHref={(p) => `?screen=support&paged=1&page=${p}`}
			/>
		{/if}
	</AdminShell>
{:else}
<AdminShell pathname="/settings" nav={{ role, isOfficeAdmin: view === 'client' }} bind:sidebar name="Shannon Carter" initials="SC">
	<SettingsShell
		{sections}
		{activeId}
		{explicit}
		onSelect={(s) => {
			activeId = s.id;
			explicit = true;
		}}
		onBack={() => (explicit = false)}
	>
		{#if activeId === NOTIFICATIONS_SECTION_ID}
			<NotificationsSection receiveEmail={true} receiveSms={false} action="#" />
		{:else if view === 'client'}
			<ClientSettingsPage
				{activeId}
				user={fx.user}
				company={fx.company}
				userProfileForm={f.userProfileForm}
				profileForm={f.profileForm}
				passwordForm={f.passwordForm}
				companyForm={f.companyForm}
				billingContactForm={f.billingContactForm}
				billingInfo={q.get('billing') === 'setup' ? fx.billing.setup : fx.billing.card}
				staffInviteForm={f.inviteForm}
				staff={empty ? [] : [...fx.staff]}
				companyLocations={fx.locations}
				pendingInvites={empty ? [] : fx.pendingInvites}
				documents={empty ? [] : fx.documents}
				affiliateStatus={fx.affiliateStatus}
				{handleAvatarUpdated}
			/>
		{:else if view === 'staff'}
			<ClientStaffSettingsPage
				{activeId}
				user={fx.user}
				userProfileForm={f.userProfileForm}
				passwordForm={f.passwordForm}
				companyForm={f.companyForm}
				affiliateStatus={fx.affiliateStatus}
				{handleAvatarUpdated}
			/>
		{:else}
			<AdminSettingsPage {activeId} user={fx.user} userProfileForm={f.userProfileForm} passwordForm={f.passwordForm} {handleAvatarUpdated} />
		{/if}
	</SettingsShell>
</AdminShell>
{/if}
