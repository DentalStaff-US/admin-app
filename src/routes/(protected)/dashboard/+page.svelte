<script lang="ts">
	import { AdminDashboardPage, ClientDashboardPage } from '$features/dashboard';

	let { data } = $props();
</script>

{#if data.dashboard?.audience === 'admin'}
	<AdminDashboardPage data={data.dashboard} user={data.user} />
{:else if data.dashboard?.audience === 'practice'}
	<ClientDashboardPage data={data.dashboard} user={data.user} />
{/if}
