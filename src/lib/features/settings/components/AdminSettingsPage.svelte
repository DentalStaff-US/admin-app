<script lang="ts">
	import { SETTINGS_MENU_OPTIONS } from '$lib/config/constants';
	import ProfileSection from './ProfileSection.svelte';
	import SecuritySection from './SecuritySection.svelte';

	// DTSS admins.
	let {
		activeId,
		user,
		userProfileForm,
		passwordForm,
		handleAvatarUpdated
	}: {
		activeId: string;
		user: any;
		userProfileForm: any;
		passwordForm: any;
		handleAvatarUpdated: (url: string, isForUser?: boolean) => Promise<void>;
	} = $props();

	const TABS = SETTINGS_MENU_OPTIONS.ADMIN;
</script>

{#if activeId === TABS.PROFILE}
	<ProfileSection {user} {userProfileForm} onAvatarUpdated={handleAvatarUpdated} />
{:else if activeId === TABS.PASSWORD}
	<SecuritySection {passwordForm} twoFactorEnabled={Boolean(user?.twoFactorEnabled)} />
{/if}
