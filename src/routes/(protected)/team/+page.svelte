<script lang="ts">
	import Page from '$dtss/Page.svelte';
	import TeamSection from '$features/settings/components/TeamSection.svelte';

	let { data } = $props();
</script>

<Page>
	<TeamSection
		asPage
		staff={data.staff}
		pendingInvites={data.pendingInvites}
		companyLocations={data.companyLocations}
	/>
</Page>
