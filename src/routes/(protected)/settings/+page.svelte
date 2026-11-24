<script lang="ts">
	import { tick } from 'svelte';
	import { superForm } from 'sveltekit-superforms/client';
	import { pushState } from '$app/navigation';
	import { page } from '$app/state';
	import {
		AdminSettingsPage,
		ClientSettingsPage,
		ClientStaffSettingsPage,
		resolveSection,
		settingsSections,
		settingsViewFor,
		SettingsShell,
		type SettingsSection
	} from '$features/settings';

	let { data } = $props();

	const view = $derived(settingsViewFor(data.user?.role, Boolean(data.hasAdminRights)));
	const affiliate = $derived(Boolean(data.affiliateStatus?.programEnabled && data.affiliateStatus?.eligible));
	const sections = $derived(view ? settingsSections(view, { affiliate }) : []);
	const fromUrl = $derived(view ? resolveSection(view, page.url, sections) : null);

	// Switching sections is shallow routing: the URL changes (so it can be shared
	// and Back works) without re-running the page's load. `null` = the list.
	const shallow = $derived((page.state as { settingsTab?: string | null }).settingsTab);
	const activeId = $derived(shallow ?? fromUrl?.id ?? '');
	const explicit = $derived(shallow === undefined ? Boolean(fromUrl?.explicit) : shallow !== null);

	function select(section: SettingsSection) {
		pushState(section.href, { settingsTab: section.id });
		window.scrollTo({ top: 0 });
	}

	function back() {
		pushState('/settings', { settingsTab: null });
	}

	// svelte-ignore state_referenced_locally
	const { form: formAvatar, enhance: avatarEnhance } = superForm(data.avatarForm as any);

	async function handleAvatarUpdated(url: string, isForUser: boolean = true) {
		$formAvatar.url = url;
		$formAvatar.isForUser = isForUser;

		// Wait for Svelte to update the DOM
		await tick();

		const form = document.getElementById('avatar-url-form') as HTMLFormElement;
		if (form) {
			form.requestSubmit();
		}
	}
</script>

{#if view}
	<SettingsShell {sections} {activeId} {explicit} onSelect={select} onBack={back}>
		{#if view === 'client'}
			<ClientSettingsPage
				{activeId}
				user={data.user}
				company={data.company}
				userProfileForm={data.userProfileForm}
				profileForm={data.profileForm}
				passwordForm={data.passwordForm}
				companyForm={data.companyForm}
				billingContactForm={data.billingContactForm}
				billingInfo={data.billingInfo}
				staff={data.staff}
				companyLocations={data.companyLocations ?? []}
				pendingInvites={data.pendingInvites ?? []}
				documents={data.documents ?? []}
				signatureRequests={data.signatureRequests ?? []}
				affiliateStatus={data.affiliateStatus ?? null}
				partnerPortalUrl={data.partnerPortalUrl ?? '/affiliate-portal'}
				{handleAvatarUpdated}
			/>
		{:else if view === 'staff'}
			<ClientStaffSettingsPage
				{activeId}
				user={data.user}
				userProfileForm={data.userProfileForm}
				passwordForm={data.passwordForm}
				companyForm={data.companyForm}
				affiliateStatus={data.affiliateStatus ?? null}
				partnerPortalUrl={data.partnerPortalUrl ?? '/affiliate-portal'}
				{handleAvatarUpdated}
			/>
		{:else}
			<AdminSettingsPage
				{activeId}
				user={data.user}
				userProfileForm={data.userProfileForm}
				passwordForm={data.passwordForm}
				{handleAvatarUpdated}
			/>
		{/if}
	</SettingsShell>
{/if}

<form id="avatar-url-form" method="POST" action="?/avatarUpload" use:avatarEnhance class="hidden">
	<input type="hidden" name="url" bind:value={$formAvatar.url} />
	<input type="hidden" name="isForUser" bind:value={$formAvatar.isForUser} />
</form>
