<script lang="ts">
	import { SETTINGS_MENU_OPTIONS } from '$lib/config/constants';
	import type { AffiliateSettingsStatus } from '$lib/server/affiliate/status';
	import type { SignatureRequestView } from '$lib/signatures/types';
	import AffiliateSection from './AffiliateSection.svelte';
	import BillingSection from './BillingSection.svelte';
	import CompanySection from './CompanySection.svelte';
	import DocumentsSection from './DocumentsSection.svelte';
	import ProfileSection from './ProfileSection.svelte';
	import SecuritySection from './SecuritySection.svelte';
	import TeamSection from './TeamSection.svelte';

	// Practice owners and staff with CLIENT_ADMIN. One section at a time; the
	// route's settings nav picks it (was a raw-button side menu in this file).
	let {
		activeId,
		user,
		company,
		userProfileForm,
		profileForm,
		passwordForm,
		companyForm,
		billingContactForm,
		billingInfo,
		staff = [],
		companyLocations = [],
		pendingInvites = [],
		documents = [],
		signatureRequests = [],
		affiliateStatus = null,
		partnerPortalUrl = '/affiliate-portal',
		handleAvatarUpdated
	}: {
		activeId: string;
		user: any;
		company: any;
		userProfileForm: any;
		profileForm: any;
		passwordForm: any;
		companyForm: any;
		billingContactForm: any;
		billingInfo: any;
		staff?: any[] | null;
		companyLocations?: Array<{ id: string; name: string | null }>;
		pendingInvites?: any[];
		documents?: any[];
		signatureRequests?: SignatureRequestView[];
		affiliateStatus?: AffiliateSettingsStatus | null;
		partnerPortalUrl?: string;
		handleAvatarUpdated: (url: string, isForUser?: boolean) => Promise<void>;
	} = $props();

	const TABS = SETTINGS_MENU_OPTIONS.CLIENT;
</script>

{#if activeId === TABS.PROFILE}
	<ProfileSection {user} {userProfileForm} {profileForm} onAvatarUpdated={handleAvatarUpdated} />
{:else if activeId === TABS.COMPANY}
	<CompanySection {companyForm} {company} onAvatarUpdated={handleAvatarUpdated} />
{:else if activeId === TABS.STAFF}
	<TeamSection {staff} {pendingInvites} {companyLocations} />
{:else if activeId === TABS.BILLING}
	<BillingSection {user} {billingInfo} {billingContactForm} />
{:else if activeId === TABS.DOCUMENTS}
	<DocumentsSection {documents} {signatureRequests} />
{:else if activeId === TABS.PASSWORD}
	<SecuritySection {passwordForm} twoFactorEnabled={Boolean(user?.twoFactorEnabled)} />
{:else if activeId === TABS.AFFILIATE && affiliateStatus}
	<AffiliateSection status={affiliateStatus} portalUrl={partnerPortalUrl} />
{/if}
