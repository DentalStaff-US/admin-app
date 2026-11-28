<script lang="ts">
	import { SETTINGS_MENU_OPTIONS } from '$lib/config/constants';
	import type { AffiliateSettingsStatus } from '$lib/server/affiliate/status';
	import AffiliateSection from './AffiliateSection.svelte';
	import CompanyInfoSection from './CompanyInfoSection.svelte';
	import ProfileSection from './ProfileSection.svelte';
	import SecuritySection from './SecuritySection.svelte';

	// Practice staff without admin rights.
	let {
		activeId,
		user,
		userProfileForm,
		passwordForm,
		companyForm,
		affiliateStatus = null,
		partnerPortalUrl = '/affiliate-portal',
		handleAvatarUpdated
	}: {
		activeId: string;
		user: any;
		userProfileForm: any;
		passwordForm: any;
		companyForm: any;
		affiliateStatus?: AffiliateSettingsStatus | null;
		partnerPortalUrl?: string;
		handleAvatarUpdated: (url: string, isForUser?: boolean) => Promise<void>;
	} = $props();

	const TABS = SETTINGS_MENU_OPTIONS.CLIENT_STAFF;
</script>

{#if activeId === TABS.PROFILE}
	<ProfileSection {user} {userProfileForm} onAvatarUpdated={handleAvatarUpdated} />
{:else if activeId === TABS.COMPANY}
	<CompanyInfoSection {companyForm} />
{:else if activeId === TABS.PASSWORD}
	<SecuritySection {passwordForm} twoFactorEnabled={Boolean(user?.twoFactorEnabled)} />
{:else if activeId === TABS.AFFILIATE && affiliateStatus}
	<AffiliateSection status={affiliateStatus} portalUrl={partnerPortalUrl} />
{/if}
