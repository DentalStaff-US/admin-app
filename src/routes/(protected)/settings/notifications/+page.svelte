<script lang="ts">
	import {
		NOTIFICATIONS_SECTION_ID,
		NotificationsSection,
		settingsSections,
		settingsViewFor,
		SettingsShell
	} from '$features/settings';

	let { data } = $props();

	// The notifications page is its own route but sits in the same settings nav.
	const view = $derived(settingsViewFor(data.user?.role, Boolean(data.isOfficeAdmin)) ?? 'admin');
	const sections = $derived(settingsSections(view, { affiliate: data.affiliateVisible }));
</script>

<svelte:head><title>Notifications | DTSS</title></svelte:head>

<SettingsShell {sections} activeId={NOTIFICATIONS_SECTION_ID} explicit>
	<NotificationsSection receiveEmail={data.receiveEmail} receiveSms={data.receiveSms} />
</SettingsShell>
