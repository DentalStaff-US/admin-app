<script lang="ts">
	import { can } from '$lib/authz';
	import { UserImportPage } from '$features/admin';

	let { data } = $props();
</script>

<svelte:head><title>Import users | DTSS</title></svelte:head>

<UserImportPage isSuperadmin={can(data.user, 'users.import')} />
