<script lang="ts">
	import { UserImportPage } from '$features/admin';

	let { data } = $props();
</script>

<svelte:head><title>Import users | DTSS</title></svelte:head>

<UserImportPage isSuperadmin={data.user?.role === 'SUPERADMIN'} />
