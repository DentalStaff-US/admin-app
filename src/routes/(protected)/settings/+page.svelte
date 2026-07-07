<script lang="ts">
	import { SETTINGS_MENU_OPTIONS, USER_ROLES } from '$lib/config/constants';
	import ClientSettingsView from '$lib/views/client/clientSettingsView.svelte';
	import type { SuperValidated } from 'sveltekit-superforms';
	import type { UserSchema, UserUpdatePasswordSchema } from '$lib/config/zod-schemas';
	import ClientStaffSettingsView from '$lib/views/client/clientStaffSettingsView.svelte';
	import { page } from '$app/stores';
	import type { PageData } from './$types';
	import AdminSettingsView from '$lib/views/admin/adminSettingsView.svelte';
	import { tick } from 'svelte';
	import { superForm } from 'sveltekit-superforms/client';

	export let data: PageData;
	export let subscriptionForm;
	export let companyForm;

	$: documents = data.documents;
	$: userProfileForm = data.userProfileForm;
	$: profileForm = data.profileForm;
	$: passwordForm = data.passwordForm;
	$: subscriptionForm = data.subscriptionForm;
	$: companyForm = data.companyForm;
	$: billingInfo = data.billingInfo;
	$: hasAdminPrivileges = data.hasAdminRights;
	$: staff = data.staff;
	$: user = data.user;
	$: URLTab = $page.url.searchParams.get('tab');
	$: URLRole = $page.url.searchParams.get('role');
	$: company = data.company;

	$: console.log('URLTab:', URLTab);

	$: defaultTab =
		user?.role === USER_ROLES.CLIENT
			? SETTINGS_MENU_OPTIONS.CLIENT.PROFILE
			: user?.role === USER_ROLES.CLIENT_STAFF
				? SETTINGS_MENU_OPTIONS.CLIENT_STAFF.PROFILE
				: SETTINGS_MENU_OPTIONS.ADMIN.PROFILE;

	$: selectedTab = URLTab && URLRole ? SETTINGS_MENU_OPTIONS[URLRole][URLTab] : defaultTab;

	const avatarForm = superForm(data.avatarForm);
	const { form: formAvatar, enhance: avatarEnhance, errors: avatarError } = avatarForm;

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

<section class="grow h-screen overflow-y-auto">
	<div class="p-6 flex flex-col gap-6 grow h-full">
		<h1 class="text-3xl font-extrabold leading-tight tracking-tighter md:text-4xl">
			Account Settings
		</h1>
		<a
			href="/settings/notifications"
			class="-mt-2 w-fit text-sm font-medium text-blue-600 hover:underline"
		>
			Manage notification preferences (email &amp; SMS) →
		</a>
		{#if user?.role === USER_ROLES.CLIENT || hasAdminPrivileges}
			<ClientSettingsView
				bind:selectedTab
				{companyForm}
				{userProfileForm}
				{profileForm}
				{passwordForm}
				{billingInfo}
				staffInviteForm={data.inviteForm}
				{staff}
				{user}
				{company}
				companyLocations={data.companyLocations ?? []}
				pendingInvites={data.pendingInvites ?? []}
				{handleAvatarUpdated}
				documents={data.documents ?? []}
			/>
		{:else if user?.role === USER_ROLES.CLIENT_STAFF}
			<ClientStaffSettingsView
				bind:selectedTab
				{userProfileForm}
				{passwordForm}
				{companyForm}
				{hasAdminPrivileges}
				{user}
				{handleAvatarUpdated}
			/>
		{:else if user?.role === USER_ROLES.SUPERADMIN}
			<AdminSettingsView
				bind:selectedTab
				{userProfileForm}
				{passwordForm}
				{user}
				{handleAvatarUpdated}
			/>
		{/if}
	</div>
	<form id="avatar-url-form" method="POST" action="?/avatarUpload" use:avatarEnhance class="hidden">
		<input type="hidden" name="url" bind:value={$formAvatar.url} />
		<input type="hidden" name="isForUser" bind:value={$formAvatar.isForUser} />
	</form>
</section>
