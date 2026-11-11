<script lang="ts">
	import { page } from '$app/state';
	import AdminShell from '$shell/AdminShell.svelte';
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
</script>

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
